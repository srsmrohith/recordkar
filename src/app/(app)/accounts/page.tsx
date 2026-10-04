import type { Metadata } from "next";
import Link from "next/link";
import type { AccountType } from "@/lib/engine/types";
import { ACCOUNT_TYPE_LABELS, inr } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";
import { ArchiveButton } from "./archive-button";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const { supabase } = await requireUser();
  const { data: accounts, error } = await supabase.from("account_balances").select("id, name, type, archived, balance").order("name");
  if (error) throw new Error(error.message);

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Accounts</h1>

      {active.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {active.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </ul>
      )}

      <AccountForm />

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-2">Archived accounts ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {archived.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AccountRow({ account: a }: { account: { id: string; name: string; type: AccountType; archived: boolean; balance: number } }) {
  const isCard = a.type === "credit_card";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/transactions?account=${a.id}`} className="text-sm font-medium hover:underline">{a.name}</Link>
        <p className="text-xs text-ink-3">{ACCOUNT_TYPE_LABELS[a.type]}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium tabular">{inr(a.balance)}</p>
        <p className="text-xs text-ink-3">{isCard ? "outstanding" : "balance"}</p>
      </div>
      <ArchiveButton id={a.id} name={a.name} archived={a.archived} balance={Number(a.balance)} isCard={isCard} />
    </li>
  );
}
