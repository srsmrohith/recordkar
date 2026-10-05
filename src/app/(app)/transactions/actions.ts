"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster, openingConflictFromError } from "@/lib/data";
import { findDuplicateFor } from "@/lib/duplicates-server";
import { openingConflict, type OpeningConflict } from "@/lib/engine/counting";
import { buildComponents, hasIssues, isBalanced, normalizeDraft, toTxnPayload, validateDraft } from "@/lib/engine/treatment";
import type { TxnDraft } from "@/lib/engine/types";
import { blockedMessage } from "@/lib/opening-notes";
import { requireUser } from "@/lib/supabase/server";

export type PostResult =
  | { ok: true; id: string }
  | { ok: false; error: string; openingConflict?: OpeningConflict }
  | {
      ok: false;
      duplicate: { kind: "transaction" | "queue"; txn_date: string | null; amount: number; label: string };
    };

/** Validate → propose → (duplicate check) → post. Components are always rebuilt server-side. */
async function prepare(draft: TxnDraft) {
  const { supabase } = await requireUser();
  const master = await loadMaster(supabase);
  const d = normalizeDraft(draft);
  const issues = validateDraft(d, master);
  if (hasIssues(issues)) return { supabase, error: Object.values(issues)[0]! } as const;
  // Manual entries and edits can't be dated before an account's opening balance date (also enforced
  // in the database). Imported rows are different: they may be approved, but don't count.
  const conflict = openingConflict(d, master);
  if (conflict) return { supabase, error: blockedMessage(conflict), openingConflict: conflict } as const;
  const components = buildComponents(d);
  if (!isBalanced(components)) return { supabase, error: "Debits and credits don't match." } as const;
  return { supabase, d, components } as const;
}

/** A database error as a PostResult, keeping the blocking account for the "Change opening balance" button. */
function dbFailure(error: { code?: string; message: string; details?: string | null }): PostResult {
  const conflict = openingConflictFromError(error);
  return conflict
    ? { ok: false, error: blockedMessage(conflict), openingConflict: conflict }
    : { ok: false, error: friendlyDbError(error) };
}

function revalidateLedger() {
  revalidatePath("/", "layout");
}

export async function postManualTransaction(draft: TxnDraft, allowDuplicate: boolean): Promise<PostResult> {
  const p = await prepare(draft);
  if ("error" in p) return { ok: false, error: p.error!, openingConflict: "openingConflict" in p ? p.openingConflict : undefined };

  if (!allowDuplicate) {
    const dup = await findDuplicateFor(p.supabase, p.d);
    if (dup) {
      return {
        ok: false,
        duplicate: {
          kind: dup.kind,
          txn_date: dup.txn_date,
          amount: Number(dup.amount),
          label: [dup.merchant, dup.description].filter(Boolean).join(" · ") || "No description",
        },
      };
    }
  }

  const { data, error } = await p.supabase.rpc("post_transaction", {
    p_txn: toTxnPayload(p.d, "manual"),
    p_components: p.components,
  });
  if (error) return dbFailure(error);
  revalidateLedger();
  return { ok: true, id: data as string };
}

export async function updateTransaction(id: string, draft: TxnDraft): Promise<PostResult> {
  const p = await prepare(draft);
  if ("error" in p) return { ok: false, error: p.error!, openingConflict: "openingConflict" in p ? p.openingConflict : undefined };
  const { error } = await p.supabase.rpc("update_transaction", {
    p_id: id,
    p_txn: toTxnPayload(p.d, "manual"),
    p_components: p.components,
  });
  if (error) return dbFailure(error);
  revalidateLedger();
  return { ok: true, id };
}

export async function deleteTransaction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_transaction", { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateLedger();
  return { ok: true };
}
