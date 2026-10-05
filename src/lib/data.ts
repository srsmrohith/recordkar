import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpeningConflict } from "@/lib/engine/counting";
import type { MasterData } from "@/lib/engine/types";
import { formatDate } from "@/lib/format";

/**
 * Accounts (with their opening balance date — the start of their records), categories, income heads
 * and events, including archived ones (for display of old records).
 */
export async function loadMaster(supabase: SupabaseClient): Promise<MasterData> {
  const [accounts, categories, incomeHeads, events, openings] = await Promise.all([
    supabase.from("accounts").select("id, name, type, archived").order("name"),
    supabase.from("categories").select("id, name, archived").order("name"),
    supabase.from("income_heads").select("id, name, nature, archived").order("name"),
    supabase.from("events").select("id, name, archived").order("name"),
    supabase.from("transactions").select("account_id, txn_date").eq("type", "OPENING_BALANCE"),
  ]);
  for (const r of [accounts, categories, incomeHeads, events, openings]) {
    if (r.error) throw new Error(r.error.message);
  }
  const openingDate = new Map<string, string>();
  for (const o of openings.data!) {
    const current = openingDate.get(o.account_id);
    if (!current || o.txn_date < current) openingDate.set(o.account_id, o.txn_date);
  }
  return {
    accounts: accounts.data!.map((a) => ({ ...a, openingDate: openingDate.get(a.id) ?? null })),
    categories: categories.data!,
    incomeHeads: incomeHeads.data!,
    events: events.data!,
  };
}

type DbError = { code?: string; message: string; details?: string | null };

/** The account a manual entry/edit falls before (database error RK001), for the "Change opening balance" button. */
export function openingConflictFromError(error: DbError): OpeningConflict | null {
  if (error.code !== "RK001" || !error.details) return null;
  try {
    const d = JSON.parse(error.details) as { account_id: string; account_name: string; opening_date: string };
    return { accountId: d.account_id, accountName: d.account_name, openingDate: d.opening_date };
  } catch {
    return null;
  }
}

/** Turn Postgres errors from the posting RPCs into messages a user can act on. */
export function friendlyDbError(error: DbError): string {
  if (error.code === "23505" && error.message.includes("transaction_references")) {
    return "A transaction with this reference already exists for this account.";
  }
  if (error.code === "23505") return "That name is already in use.";
  if (error.code === "23514") return "The entry doesn't balance or breaks an accounting rule, so it wasn't posted.";
  if (error.code === "RK001") {
    const c = openingConflictFromError(error);
    return c
      ? `${c.accountName}'s records start on ${formatDate(c.openingDate)} (its opening balance date). Use a date on or after it, or change the opening balance.`
      : "This date is before the account's opening balance date.";
  }
  if (error.code === "RK002") return "Date can't be in the future.";
  if (error.code === "P0001" || error.code === "P0002") return error.message;
  return `Something went wrong: ${error.message}`;
}

