import { NextResponse } from "next/server";
import { getContractEventsPage } from "@/lib/soroban";
import { parsePageRequest } from "@/lib/history-cursor";
import { EVENT_PAGE_SIZE } from "@/lib/contract-lists";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-events" });
  if (limited) return limited;

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "csv") {
    const request = parsePageRequest(url, EVENT_PAGE_SIZE);
    if (!request) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

    const { items, error } = await getContractEventsPage(params.id, request);
    if (error) {
      return NextResponse.json({ events: [], nextCursor: null, error }, { status: 502 });
    }

    const header = ["ledger", "timestamp", "function", "args", "result", "fee"];
    const rows = items.map((event) =>
      [event.ledger, event.timestamp, event.function, event.args, event.result, event.fee]
        .map(csvCell)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contract-${params.id}-events.csv"`,
      },
    });
  }

  const request = parsePageRequest(url, EVENT_PAGE_SIZE);
  if (!request) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  const { items, nextCursor, error } = await getContractEventsPage(params.id, request);
  if (error) {
    return NextResponse.json({ events: [], nextCursor: null, error }, { status: 502 });
  }
  return NextResponse.json({ events: items, nextCursor, error: null });
}
