import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthStart } from "@/lib/format";
import type { TxnFilters } from "@/lib/txn-filters";

export const TXN_LIST_COLUMNS =
  "id, txn_date, value_date, type, direction, amount, account_id, counter_account_id, category_id, income_head_id, counter_system_head, merchant, description, event_id, notes, source";

/** Transactions matching the filters, newest first. Shared by the list and Export CSV. */
export function queryTransactions(supabase: SupabaseClient, f: TxnFilters, limit: number) {
  let q = supabase
    .from("transactions")
    .select(TXN_LIST_COLUMNS)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (f.dates.mode === "month") q = q.gte("txn_date", f.dates.month).lt("txn_date", monthStart(f.dates.month, 1));
  else if (f.dates.mode === "range") {
    if (f.dates.from) q = q.gte("txn_date", f.dates.from);
    if (f.dates.to) q = q.lte("txn_date", f.dates.to);
  }

  if (f.counter?.kind === "category") q = q.eq("category_id", f.counter.id);
  if (f.counter?.kind === "income_head") q = q.eq("income_head_id", f.counter.id);
  if (f.event) q = q.eq("event_id", f.event);
  if (f.min !== null) q = q.gte("amount", f.min);
  if (f.max !== null) q = q.lte("amount", f.max);

  // OR-groups: an account matches either side of a transfer; search matches merchant or description.
  const groups: string[] = [];
  if (f.account) groups.push(`or(account_id.eq.${f.account},counter_account_id.eq.${f.account})`);
  if (f.q) groups.push(`or(merchant.ilike.%${f.q}%,description.ilike.%${f.q}%)`);
  if (groups.length) q = q.or(`and(${groups.join(",")})`);

  return q;
}
