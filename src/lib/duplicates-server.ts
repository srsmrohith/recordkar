import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  candidateDateRange,
  duplicateFlagUpdate,
  findFuzzyDuplicate,
  findReferenceMatch,
  type DuplicateCandidate,
  type ReferenceCandidate,
} from "@/lib/engine/duplicates";
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

/**
 * Re-run duplicate checks for a Queue item after it was edited (e.g. its account was fixed on the
 * card). Same account + same reference wins over a fuzzy match. Returns whether the flag changed.
 */
export async function recheckQueueItem(supabase: SupabaseClient, queueId: string, draft: TxnDraft): Promise<boolean> {
  const stored = await supabase
    .from("transaction_queue")
    .select("duplicate_of_transaction_id, duplicate_of_queue_id, duplicate_reviewed")
    .eq("id", queueId)
    .maybeSingle();
  if (stored.error) throw new Error(stored.error.message);
  if (!stored.data) return false;

  let found: Pick<DuplicateCandidate, "id" | "kind"> | null = null;
  if (draft.accountId && draft.reference?.trim()) {
    // Exact, case-insensitive match: escape ilike wildcards that may appear in bank references.
    const ref = draft.reference.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const [posted, queued] = await Promise.all([
      supabase.from("transaction_references").select("transaction_id, account_id, reference").eq("account_id", draft.accountId).ilike("reference", ref),
      supabase
        .from("transaction_queue")
        .select("id, account_id, reference")
        .eq("account_id", draft.accountId)
        .ilike("reference", ref)
        .neq("status", "discarded")
        .neq("id", queueId),
    ]);
    if (posted.error || queued.error) throw new Error((posted.error ?? queued.error)!.message);
    const refCandidates: ReferenceCandidate[] = [
      ...posted.data.map((r) => ({ id: r.transaction_id, kind: "transaction" as const, account_id: r.account_id, reference: r.reference, amount: null, txn_date: null, merchant: null, description: null })),
      ...queued.data.map((q) => ({ id: q.id, kind: "queue" as const, account_id: q.account_id, reference: q.reference, amount: null, txn_date: null, merchant: null, description: null })),
    ];
    found = findReferenceMatch(draft, refCandidates);
  }
  if (!found) found = await findDuplicateFor(supabase, draft, { excludeQueueIds: [queueId] });

  const update = duplicateFlagUpdate(stored.data, found);
  if (!update.changed) return false;
  const { error } = await supabase.from("transaction_queue").update(update.fields).eq("id", queueId);
  if (error) throw new Error(error.message);
  return true;
}
