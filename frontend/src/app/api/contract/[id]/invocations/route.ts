import { NextResponse } from "next/server";
import { getInvocationHistoryPage } from "@/lib/soroban";
import { parsePageRequest } from "@/lib/history-cursor";
import { INVOCATION_PAGE_SIZE } from "@/lib/contract-lists";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-invocations" });
  if (limited) return limited;

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "csv") {
    const request = parsePageRequest(url, INVOCATION_PAGE_SIZE);
    if (!request) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

    const { items } = await getInvocationHistoryPage(params.id, request);
    const header = ["ledger", "timestamp", "function", "args", "result", "fee"];
    const rows = items.map((invocation) =>
      [
        invocation.ledger,
        invocation.timestamp,
        invocation.functionName,
        invocation.args,
        invocation.result,
        invocation.fee,
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invocations-${params.id}.csv"`,
      },
    });
  }

  const request = parsePageRequest(url, INVOCATION_PAGE_SIZE);
  if (!request) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  const { items, nextCursor } = await getInvocationHistoryPage(params.id, request);
  return NextResponse.json({ invocations: items, nextCursor });
}
