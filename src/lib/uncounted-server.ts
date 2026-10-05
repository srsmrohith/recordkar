import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { blockingAccount, startsFromMaster } from "@/lib/engine/counting";
import type { MasterData } from "@/lib/engine/types";

export type UncountedTxn = {
  id: string;
  txn_date: string;
  account_id: string;
  counter_account_id: string | null;
  /** The account whose opening balance date it falls before. */
  blockedBy: string;
};

/**
 * Transactions dated before the opening balance date of an account they touch (either leg), which
 * are therefore not counted. Only accounts with an opening balance can have any.
 */
export async function loadUncounted(supabase: SupabaseClient, master: MasterData): Promise<UncountedTxn[]> {
  const starts = startsFromMaster(master);
  if (starts.size === 0) return [];
  const groups = [...starts].flatMap(([id, date]) => [
    `and(account_id.eq.${id},txn_date.lt.${date})`,
    `and(counter_account_id.eq.${id},txn_date.lt.${date})`,
  ]);
  const { data, error } = await supabase
    .from("transactions")
    .select("id, txn_date, account_id, counter_account_id")
    .or(groups.join(","));
  if (error) throw new Error(error.message);
  return data.flatMap((t) => {
    const blockedBy = blockingAccount(t, starts);
    return blockedBy ? [{ ...t, blockedBy }] : [];
  });
}
