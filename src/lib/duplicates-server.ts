import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateDateRange, findFuzzyDuplicate, type DuplicateCandidate } from "@/lib/engine/duplicates";
import type { TxnDraft } from "@/lib/engine/types";

const COLS = "id, account_id, amount, txn_date, merchant, description";

/**
 * Posted transactions and pending Queue items that could record the same real-world
 * transactions as `drafts` (same accounts, within the duplicate date window).
 */
export async function loadDuplicateCandidates(
  supabase: SupabaseClient,
  drafts: Pick<TxnDraft, "accountId" | "txnDate">[],
  opts: { excludeTransactionId?: string; excludeQueueIds?: string[] } = {},
): Promise<DuplicateCandidate[]> {
  const accountIds = [...new Set(drafts.map((d) => d.accountId).filter((x): x is string => Boolean(x)))];
  const range = candidateDateRange(drafts.map((d) => d.txnDate).filter((x): x is string => Boolean(x)));
  if (accountIds.length === 0 || !range) return [];

  // Transfers touch two accounts; match on either side.
  const [txns, counterTxns, queue] = await Promise.all([
    supabase.from("transactions").select(COLS).in("account_id", accountIds).gte("txn_date", range.from).lte("txn_date", range.to),
    supabase
      .from("transactions")
      .select(`id, account_id:counter_account_id, amount, txn_date, merchant, description`)
      .in("counter_account_id", accountIds)
      .gte("txn_date", range.from)
      .lte("txn_date", range.to),
    supabase
      .from("transaction_queue")
      .select(COLS)
      .eq("status", "pending")
      .in("account_id", accountIds)
      .gte("txn_date", range.from)
      .lte("txn_date", range.to),
  ]);
  for (const r of [txns, counterTxns, queue]) if (r.error) throw new Error(r.error.message);

  const excludeQueue = new Set(opts.excludeQueueIds ?? []);
  return [
    ...[...txns.data!, ...counterTxns.data!]
      .filter((t) => t.id !== opts.excludeTransactionId)
      .map((t) => ({ ...t, kind: "transaction" as const })),
    ...queue.data!.filter((q) => !excludeQueue.has(q.id)).map((q) => ({ ...q, kind: "queue" as const })),
  ];
}

export async function findDuplicateFor(
  supabase: SupabaseClient,
  draft: TxnDraft,
  opts: { excludeTransactionId?: string; excludeQueueIds?: string[] } = {},
): Promise<DuplicateCandidate | null> {
  const candidates = await loadDuplicateCandidates(supabase, [draft], opts);
  return findFuzzyDuplicate(draft, candidates);
}
