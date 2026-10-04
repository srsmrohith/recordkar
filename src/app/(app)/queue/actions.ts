"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster } from "@/lib/data";
import { recheckQueueItem } from "@/lib/duplicates-server";
import {
  allowedCounterKinds,
  buildComponents,
  draftFromRow,
  draftToRow,
  hasIssues,
  isBalanced,
  normalizeDraft,
  toTxnPayload,
  validateDraft,
  type DraftRow,
} from "@/lib/engine/treatment";
import type { Counter, MasterData, TxnDraft, UserTxnType } from "@/lib/engine/types";
import { requireUser } from "@/lib/supabase/server";

type SupabaseServer = Awaited<ReturnType<typeof requireUser>>["supabase"];
type QueueRow = DraftRow & {
  id: string;
  duplicate_of_transaction_id: string | null;
  duplicate_of_queue_id: string | null;
  duplicate_reviewed: boolean;
};

const revalidate = () => revalidatePath("/", "layout");

/**
 * Persist inline edits from a Queue card (autosaved), then re-run the duplicate checks — e.g. once an
 * unrecognised account is fixed, the reference and fuzzy checks can finally run. Approval saves first,
 * so it always approves against an up-to-date duplicate flag.
 */
export async function saveQueueItem(
  id: string,
  draft: TxnDraft,
): Promise<{ ok: boolean; error?: string; duplicateChanged?: boolean }> {
  const { supabase } = await requireUser();
  const { reference, ...row } = draftToRow(draft);
  const { error } = await supabase
    .from("transaction_queue")
    .update({ ...row, reference })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: friendlyDbError(error) };
  try {
    const duplicateChanged = await recheckQueueItem(supabase, id, draft);
    if (duplicateChanged) revalidate();
    return { ok: true, duplicateChanged };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't check for duplicates." };
  }
}

async function postOne(supabase: SupabaseServer, master: MasterData, row: QueueRow): Promise<string | null> {
  if ((row.duplicate_of_transaction_id || row.duplicate_of_queue_id) && !row.duplicate_reviewed) {
    return "Possible duplicate — choose Keep or Discard first";
  }
  const d = normalizeDraft(draftFromRow(row));
  const issues = validateDraft(draftFromRow(row), master);
  if (hasIssues(issues)) return Object.values(issues)[0]!;
  const components = buildComponents(d);
  if (!isBalanced(components)) return "Debits and credits don't match";
  const { error } = await supabase.rpc("post_transaction", {
    p_txn: toTxnPayload(d, "csv"),
    p_components: components,
    p_queue_id: row.id,
  });
  return error ? friendlyDbError(error) : null;
}

const QUEUE_COLS =
  "id, txn_date, value_date, type, direction, amount, account_id, counter_account_id, category_id, income_head_id, counter_system_head, merchant, description, event_id, notes, reference, duplicate_of_transaction_id, duplicate_of_queue_id, duplicate_reviewed";

/** User approval → post (Rupevo §2). The draft is saved first so the Queue record matches what was posted. */
export async function approveQueueItem(id: string, draft: TxnDraft): Promise<{ ok: boolean; error?: string }> {
  const saved = await saveQueueItem(id, draft);
  if (!saved.ok) return saved;
  const { supabase } = await requireUser();
  const [master, row] = await Promise.all([
    loadMaster(supabase),
    supabase.from("transaction_queue").select(QUEUE_COLS).eq("id", id).eq("status", "pending").maybeSingle(),
  ]);
  if (row.error) return { ok: false, error: row.error.message };
  if (!row.data) return { ok: false, error: "This item is no longer pending." };
  const error = await postOne(supabase, master, row.data as QueueRow);
  revalidate();
  return error ? { ok: false, error } : { ok: true };
}

/** Bulk approve: each item is validated and posted on its own; incomplete ones are reported, not guessed. */
export async function bulkApprove(ids: string[]): Promise<{ posted: number; failed: { id: string; reason: string }[] }> {
  const { supabase } = await requireUser();
  const [master, rows] = await Promise.all([
    loadMaster(supabase),
    supabase.from("transaction_queue").select(QUEUE_COLS).in("id", ids).eq("status", "pending"),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  let posted = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const row of rows.data as QueueRow[]) {
    const error = await postOne(supabase, master, row);
    if (error) failed.push({ id: row.id, reason: error });
    else posted++;
  }
  revalidate();
  return { posted, failed };
}

/** Apply a type and its category / income head to several items at once. */
export async function bulkSetClassification(ids: string[], type: UserTxnType, counter: Counter | null) {
  if (counter && !allowedCounterKinds(type).includes(counter.kind)) throw new Error("That category doesn't fit this type.");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("transaction_queue").select(QUEUE_COLS).in("id", ids).eq("status", "pending");
  if (error) throw new Error(error.message);
  for (const row of data as QueueRow[]) {
    const draft = normalizeDraft({ ...draftFromRow(row), type, counter: counter ?? draftFromRow(row).counter });
    // Keep the statement's direction as evidence; normalizeDraft only fills it for types that imply one.
    const res = await saveQueueItem(row.id, { ...draft, direction: row.direction ?? draft.direction });
    if (!res.ok) throw new Error(res.error);
  }
  revalidate();
}

export async function discardQueueItems(ids: string[]) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transaction_queue").update({ status: "discarded" }).in("id", ids).eq("status", "pending");
  if (error) throw new Error(friendlyDbError(error));
  revalidate();
}

/** "Not a duplicate — keep it": clears the duplicate flag so the item can be approved. */
export async function keepDespiteDuplicate(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transaction_queue").update({ duplicate_reviewed: true }).eq("id", id);
  if (error) throw new Error(friendlyDbError(error));
  revalidate();
}
