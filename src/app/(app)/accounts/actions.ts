"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/data";
import { buildComponents, isValidIsoDate, toTxnPayload } from "@/lib/engine/treatment";
import { emptyDraft, type AccountType } from "@/lib/engine/types";
import { inr } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export type AccountFormState = { error?: string; ok?: boolean };

const TYPES: AccountType[] = ["bank", "cash", "credit_card", "wallet"];

export async function createAccount(_: AccountFormState, form: FormData): Promise<AccountFormState> {
  const name = String(form.get("name") ?? "").trim();
  const type = String(form.get("type") ?? "") as AccountType;
  const openingRaw = String(form.get("opening") ?? "").trim();
  const asOf = String(form.get("asOf") ?? "");

  if (!name) return { error: "Give the account a name." };
  if (!TYPES.includes(type)) return { error: "Choose an account type." };
  const opening = openingRaw === "" ? 0 : Math.round(Number(openingRaw) * 100) / 100;
  if (!Number.isFinite(opening) || opening < 0) return { error: "Opening amount must be zero or more." };
  if (opening > 0 && !isValidIsoDate(asOf)) return { error: "Choose the date the opening amount is as of." };

  const id = randomUUID();
  let openingTxn = null;
  let openingComponents = null;
  if (opening > 0) {
    // Money held is an inflow to the account; a card's existing outstanding is a charge to it.
    const draft = {
      ...emptyDraft(),
      type: "OPENING_BALANCE" as const,
      direction: type === "credit_card" ? ("DEBIT" as const) : ("CREDIT" as const),
      txnDate: asOf,
      amount: opening,
      accountId: id,
      description: "Opening balance",
    };
    openingTxn = toTxnPayload(draft, "system");
    openingComponents = buildComponents(draft);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_account", {
    p_account: { id, name, type },
    p_opening_txn: openingTxn,
    p_opening_components: openingComponents,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Archive (hide from pickers) or restore an account. Archiving is only allowed at exactly ₹0, so
 * Net worth and Net balance never silently lose money; history stays intact either way.
 */
export async function setAccountArchived(id: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireUser();
  if (archived) {
    const { data, error } = await supabase.from("account_balances").select("type, balance").eq("id", id).maybeSingle();
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data) return { ok: false, error: "Account not found." };
    const remaining = Number(data.balance);
    if (Math.round(remaining * 100) !== 0) {
      const amount = inr(Math.abs(remaining));
      return {
        ok: false,
        error:
          data.type === "credit_card"
            ? `This card still has ${amount} outstanding. Pay it off or adjust it to zero first — only accounts at ₹0 can be archived.`
            : `Move or adjust the remaining ${amount} first — only accounts at ₹0 can be archived.`,
      };
    }
  }
  const { error } = await supabase.from("accounts").update({ archived }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
