import type { Metadata } from "next";
import Link from "next/link";
import { loadMaster } from "@/lib/data";
import { emptyDraft } from "@/lib/engine/types";
import { todayIso } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Add transaction" };

export default async function NewTransactionPage() {
  const { supabase } = await requireUser();
  const master = await loadMaster(supabase);
  const active = master.accounts.filter((a) => !a.archived);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Add transaction</h1>
      {active.length === 0 ? (
        <div className="card text-sm text-ink-2">
          You need at least one account before recording transactions.{" "}
          <Link href="/accounts" className="text-brand underline">Add an account</Link>
        </div>
      ) : (
        <TransactionForm
          master={master}
          initial={{ ...emptyDraft(), txnDate: todayIso(), accountId: active.length === 1 ? active[0].id : null }}
        />
      )}
    </div>
  );
}
