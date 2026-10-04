import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadMaster } from "@/lib/data";
import { draftFromRow, type DraftRow } from "@/lib/engine/treatment";
import { requireUser } from "@/lib/supabase/server";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const [master, txn, refs, log] = await Promise.all([
    loadMaster(supabase),
    supabase.from("transactions").select("*").eq("id", id).maybeSingle(),
    supabase.from("transaction_references").select("reference").eq("transaction_id", id).limit(1),
    // Edit log entries (stored in the audit_history table).
    supabase
      .from("audit_history")
      .select("id", { count: "exact", head: true })
      .eq("entity", "transaction")
      .eq("entity_id", id),
  ]);
  if (txn.error) throw new Error(txn.error.message);
  if (!txn.data) notFound();

  const draft = draftFromRow({ ...(txn.data as DraftRow), reference: refs.data?.[0]?.reference ?? null });
  // Manual transfers are From → To (a DEBIT on From). An incoming (CREDIT) transfer, e.g. imported from
  // a statement, keeps its statement account and is edited with an explicit Debit/Credit field instead.
  const fieldsMode = draft.type === "TRANSFER" && draft.direction === "CREDIT" ? "queue" : "manual";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Edit transaction</h1>
        <Link href={`/transactions/edit-log?transaction=${id}`} className="text-sm text-brand">
          View edit log{log.count ? ` (${log.count})` : ""}
        </Link>
      </div>
      <TransactionForm master={master} initial={draft} transactionId={id} fieldsMode={fieldsMode} />
    </div>
  );
}
