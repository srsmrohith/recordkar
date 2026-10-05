import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMaster } from "@/lib/data";
import { isValidIsoDate } from "@/lib/engine/treatment";
import { safeReturnTo } from "@/lib/opening-notes";
import { requireUser } from "@/lib/supabase/server";
import { OpeningBalanceForm } from "./opening-balance-form";

export const metadata: Metadata = { title: "Opening balance" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Change an account's opening balance — the start of its records — with a preview before saving. */
export default async function OpeningBalancePage({ params, searchParams }: PageProps<"/accounts/[id]/opening-balance">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();

  const { supabase } = await requireUser();
  const [master, opening] = await Promise.all([
    loadMaster(supabase),
    supabase.from("transactions").select("id, txn_date, amount").eq("account_id", id).eq("type", "OPENING_BALANCE").order("txn_date").limit(1),
  ]);
  const account = master.accounts.find((a) => a.id === id);
  if (!account) notFound();
  if (opening.error) throw new Error(opening.error.message);
  const current = opening.data[0] ?? null;

  const suggested = typeof sp.date === "string" && isValidIsoDate(sp.date) ? sp.date : null;
  const returnTo = safeReturnTo(typeof sp.returnTo === "string" ? sp.returnTo : null);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{current ? "Change opening balance" : "Add opening balance"}</h1>
        <p className="text-sm text-ink-2">{account.name}</p>
      </div>
      <OpeningBalanceForm
        accountId={id}
        accountName={account.name}
        isCard={account.type === "credit_card"}
        current={current ? { date: current.txn_date, amount: Number(current.amount) } : null}
        initialDate={suggested ?? current?.txn_date ?? null}
        returnTo={returnTo}
      />
    </div>
  );
}
