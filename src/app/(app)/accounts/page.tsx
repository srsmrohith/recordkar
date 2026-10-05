import type { Metadata } from "next";
import Link from "next/link";
import type { AccountType } from "@/lib/engine/types";
import { ACCOUNT_TYPE_LABELS, inr } from "@/lib/format";
import { loadMaster } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { loadUncounted } from "@/lib/uncounted-server";
import { accountTransactionsHref } from "@/lib/txn-filters";
import { AccountForm } from "./account-form";
import { ArchiveButton } from "./archive-button";
import { OpeningBalance } from "./opening-balance";

export const metadata: Metadata = { title: "Accounts" };

type Row = { id: string; name: string; type: AccountType; archived: boolean; balance: number };
type Opening = { amount: number; date: string };

export default async function AccountsPage() {
  const { supabase } = await requireUser();
  const [balances, openings, master] = await Promise.all([
    supabase.from("account_balances").select("id, name, type, archived, balance").order("name"),
    supabase.from("transactions").select("account_id, amount, txn_date").eq("type", "OPENING_BALANCE"),
    loadMaster(supabase),
  ]);
  if (balances.error) throw new Error(balances.error.message);
  if (openings.error) throw new Error(openings.error.message);

  const openingByAccount = new Map<string, Opening>(
    openings.data.map((o) => [o.account_id, { amount: Number(o.amount), date: o.txn_date }]),
  );
  // Transactions dated before an account's opening balance date aren't counted; note them per account.
  const uncountedByAccount = new Map<string, number>();
  for (const t of await loadUncounted(supabase, master)) {
    uncountedByAccount.set(t.blockedBy, (uncountedByAccount.get(t.blockedBy) ?? 0) + 1);
  }
  const accounts = balances.data as Row[];
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Accounts</h1>

      {active.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {active.map((a) => (
            <AccountRow key={a.id} account={a} opening={openingByAccount.get(a.id) ?? null} uncounted={uncountedByAccount.get(a.id) ?? 0} />
          ))}
        </ul>
      )}

      <AccountForm />

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-2">Archived accounts ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {archived.map((a) => (
              <AccountRow key={a.id} account={a} opening={openingByAccount.get(a.id) ?? null} uncounted={uncountedByAccount.get(a.id) ?? 0} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AccountRow({ account: a, opening, uncounted }: { account: Row; opening: Opening | null; uncounted: number }) {
  const isCard = a.type === "credit_card";
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={accountTransactionsHref(a.id)} className="text-sm font-medium hover:underline">{a.name}</Link>
        <p className="text-xs text-ink-3">{ACCOUNT_TYPE_LABELS[a.type]}</p>
        <OpeningBalance accountId={a.id} isCard={isCard} opening={opening} uncountedCount={uncounted} />
      </div>
      <div className="text-right">
        <p className="text-sm font-medium tabular">{inr(a.balance)}</p>
        <p className="text-xs text-ink-3">{isCard ? "outstanding" : "balance"}</p>
        <Link href={accountTransactionsHref(a.id)} className="mt-1 inline-block text-xs font-medium text-brand">
          View transactions →
        </Link>
      </div>
      <ArchiveButton id={a.id} name={a.name} archived={a.archived} balance={Number(a.balance)} isCard={isCard} />
    </li>
  );
}
