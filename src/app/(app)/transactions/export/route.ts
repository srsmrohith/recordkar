import { NextResponse, type NextRequest } from "next/server";
import { loadMaster } from "@/lib/data";
import { buildTransactionsCsv, type ExportRow } from "@/lib/export-csv";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { parseTxnFilters } from "@/lib/txn-filters";
import { queryTransactions } from "@/lib/txn-query";

const MAX_EXPORT_ROWS = 10_000;

/** Export CSV of the current filtered Transactions view (same query parameters as the page). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));

  const filters = parseTxnFilters(Object.fromEntries(request.nextUrl.searchParams), todayIso());
  const [master, txns] = await Promise.all([loadMaster(supabase), queryTransactions(supabase, filters, MAX_EXPORT_ROWS)]);
  if (txns.error) return new NextResponse(`Export failed: ${txns.error.message}`, { status: 500 });

  const rows = txns.data as unknown as ExportRow[];
  const refs = new Map<string, string[]>();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => r.id);
    const r = await supabase.from("transaction_references").select("transaction_id, reference").in("transaction_id", chunk);
    if (r.error) return new NextResponse(`Export failed: ${r.error.message}`, { status: 500 });
    for (const x of r.data) refs.set(x.transaction_id, [...(refs.get(x.transaction_id) ?? []), x.reference]);
  }

  return new NextResponse(buildTransactionsCsv(rows, master, refs), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recordkar-transactions-${todayIso()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
