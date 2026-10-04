"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster } from "@/lib/data";
import { findDuplicateFor } from "@/lib/duplicates-server";
import { buildComponents, hasIssues, isBalanced, normalizeDraft, toTxnPayload, validateDraft } from "@/lib/engine/treatment";
import type { TxnDraft } from "@/lib/engine/types";
import { requireUser } from "@/lib/supabase/server";

export type PostResult =
  | { ok: true; id: string }
  | { ok: false; error: string }
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
  const components = buildComponents(d);
  if (!isBalanced(components)) return { supabase, error: "Debits and credits don't match." } as const;
  return { supabase, d, components } as const;
}

function revalidateLedger() {
  revalidatePath("/", "layout");
}

export async function postManualTransaction(draft: TxnDraft, allowDuplicate: boolean): Promise<PostResult> {
  const p = await prepare(draft);
  if ("error" in p) return { ok: false, error: p.error! };

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
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateLedger();
  return { ok: true, id: data as string };
}

export async function updateTransaction(id: string, draft: TxnDraft): Promise<PostResult> {
  const p = await prepare(draft);
  if ("error" in p) return { ok: false, error: p.error! };
  const { error } = await p.supabase.rpc("update_transaction", {
    p_id: id,
    p_txn: toTxnPayload(p.d, "manual"),
    p_components: p.components,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
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
