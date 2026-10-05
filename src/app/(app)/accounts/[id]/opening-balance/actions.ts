"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster } from "@/lib/data";
import { previewOpeningChange, startsFromMaster, type BalanceTxn } from "@/lib/engine/counting";
import { buildComponents, isValidIsoDate, toTxnPayload } from "@/lib/engine/treatment";
import { emptyDraft, type AccountType } from "@/lib/engine/types";
import { todayIso } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

export type PreviewItem = { id: string; date: string; label: string; amount: number; out: boolean };
export type OpeningPreviewResult =
  | {
      ok: true;
      move: "earlier" | "later" | "same" | "new";
      currentBalance: number;
      newBalance: number;
      startCounting: PreviewItem[];
      stopCounting: PreviewItem[];
    }
  | { ok: false; error: string };

/** Every transaction touching the account (either side of a transfer), including its opening balance. */
async function accountTransactions(supabase: Supabase, accountId: string): Promise<BalanceTxn[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, txn_date, type, direction, amount, account_id, counter_account_id, merchant, description")
    .or(`account_id.eq.${accountId},counter_account_id.eq.${accountId}`)
    .order("txn_date");
  if (error) throw new Error(error.message);
  return data as BalanceTxn[];
}

function validate(newDate: string, newAmount: number): string | null {
  if (!isValidIsoDate(newDate)) return "Choose a valid date.";
  if (newDate > todayIso()) return "The opening balance date can't be in the future.";
  if (!Number.isFinite(newAmount) || newAmount <= 0) return "Enter an opening amount more than zero.";
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function compute(accountId: string, newDate: string, newAmount: number) {
  // accountId goes into a PostgREST filter string, so it must be a plain UUID.
  if (!UUID.test(accountId)) throw new Error("Account not found.");
  const { supabase } = await requireUser();
  const [master, txns] = await Promise.all([loadMaster(supabase), accountTransactions(supabase, accountId)]);
  const account = master.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found.");
  const opening = txns.find((t) => t.type === "OPENING_BALANCE" && t.account_id === accountId) ?? null;
  const preview = previewOpeningChange({
    txns,
    accountId,
    accountType: account.type as AccountType,
    starts: startsFromMaster(master),
    newDate,
    newAmount,
  });
  const move: "earlier" | "later" | "same" | "new" = !opening
    ? "new"
    : newDate < opening.txn_date
      ? "earlier"
      : newDate > opening.txn_date
        ? "later"
        : "same";
  return { supabase, account, opening, preview, move };
}

const toItem = (t: BalanceTxn, accountId: string): PreviewItem => ({
  id: t.id,
  date: t.txn_date,
  label: t.merchant || t.description || (t.counter_account_id ? "Transfer" : "Transaction"),
  amount: Number(t.amount),
  out: (t.account_id === accountId) === (t.direction === "DEBIT"),
});

export async function previewOpening(accountId: string, newDate: string, newAmount: number): Promise<OpeningPreviewResult> {
  const invalid = validate(newDate, newAmount);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { preview, move } = await compute(accountId, newDate, newAmount);
    return {
      ok: true,
      move,
      currentBalance: preview.currentBalance,
      newBalance: preview.newBalance,
      startCounting: preview.startCounting.map((t) => toItem(t, accountId)),
      stopCounting: preview.stopCounting.map((t) => toItem(t, accountId)),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't preview the change." };
  }
}

/**
 * Save the opening balance (date + amount) through the normal engine: the same balanced components,
 * the update/post RPCs, and the Edit log. Moving the date earlier needs the amount re-confirmed; moving
 * it later needs the transactions that stop counting confirmed.
 */
export async function saveOpening(
  accountId: string,
  newDate: string,
  newAmount: number,
  confirmed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invalid = validate(newDate, newAmount);
  if (invalid) return { ok: false, error: invalid };
  let computed;
  try {
    computed = await compute(accountId, newDate, newAmount);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the opening balance." };
  }
  const { supabase, account, opening, preview, move } = computed;
  if (move === "earlier" && !confirmed) return { ok: false, error: "Re-confirm the opening amount for the new date." };
  if (preview.stopCounting.length > 0 && !confirmed) {
    return { ok: false, error: "Confirm that the listed transactions will stop counting." };
  }

  const draft = {
    ...emptyDraft(),
    type: "OPENING_BALANCE" as const,
    direction: account.type === "credit_card" ? ("DEBIT" as const) : ("CREDIT" as const),
    txnDate: newDate,
    amount: Math.round(newAmount * 100) / 100,
    accountId,
    description: "Opening balance",
  };
  const payload = toTxnPayload(draft, "system");
  const components = buildComponents(draft);
  const { error } = opening
    ? await supabase.rpc("update_transaction", { p_id: opening.id, p_txn: payload, p_components: components })
    : await supabase.rpc("post_transaction", { p_txn: payload, p_components: components });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
