import type { Metadata } from "next";
import Link from "next/link";
import { loadMaster } from "@/lib/data";
import { draftFromRow, type DraftRow, type Issues } from "@/lib/engine/treatment";
import { inr } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { QueueList, type QueueItem } from "./queue-list";

export const metadata: Metadata = { title: "Queue" };

const PAGE_SIZE = 200;

export default async function QueuePage() {
  const { supabase } = await requireUser();
  const [master, queue, totals] = await Promise.all([
    loadMaster(supabase),
    supabase
      .from("transaction_queue")
      .select("*")
      .eq("status", "pending")
      .order("txn_date", { ascending: true, nullsFirst: true })
      .order("created_at")
      .limit(PAGE_SIZE),
    supabase.from("transaction_queue").select("amount").eq("status", "pending"),
  ]);
  if (queue.error) throw new Error(queue.error.message);
  const rows = queue.data;

  // Details of what each flagged item may duplicate, so the user can compare.
  const dupTxnIds = rows.map((r) => r.duplicate_of_transaction_id).filter(Boolean);
  const dupQueueIds = rows.map((r) => r.duplicate_of_queue_id).filter(Boolean);
  const [dupTxns, dupQueue] = await Promise.all([
    dupTxnIds.length
      ? supabase.from("transactions").select("id, txn_date, amount, merchant, description").in("id", dupTxnIds)
      : { data: [] },
    dupQueueIds.length
      ? supabase.from("transaction_queue").select("id, txn_date, amount, merchant, description, status").in("id", dupQueueIds)
      : { data: [] },
  ]);
  const dupInfo = new Map<string, QueueItem["duplicate"]>();
  for (const t of dupTxns.data ?? []) dupInfo.set(t.id, { kind: "transaction", ...t, amount: Number(t.amount) });
  for (const q of dupQueue.data ?? []) dupInfo.set(q.id, { kind: "queue", ...q, amount: Number(q.amount) });

  const items: QueueItem[] = rows.map((r) => {
    const dupId = r.duplicate_of_transaction_id ?? r.duplicate_of_queue_id;
    return {
      id: r.id,
      draft: draftFromRow(r as DraftRow),
      importIssues: r.issues as Issues,
      personText: r.person_text,
      groupText: r.group_text,
      duplicate: dupId && !r.duplicate_reviewed ? (dupInfo.get(dupId) ?? null) : null,
    };
  });

  const pendingTotal = (totals.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const pendingCount = totals.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Queue</h1>
          <p className="text-sm text-ink-2">
            {pendingCount > 0
              ? `${pendingCount} imported transaction${pendingCount === 1 ? "" : "s"} awaiting review · ${inr(pendingTotal)}`
              : "Imported transactions awaiting review appear here."}
          </p>
        </div>
        <Link href="/import" className="btn-secondary">Import CSV</Link>
      </div>

      {items.length === 0 ? (
        <div className="card text-center text-sm text-ink-2">
          Nothing to review. Manual entries are posted directly; the Queue holds only imported transactions.
        </div>
      ) : (
        <>
          <QueueList items={items} master={master} />
          {pendingCount > PAGE_SIZE && (
            <p className="text-center text-xs text-ink-3">Showing the oldest {PAGE_SIZE}. Review these to see more.</p>
          )}
        </>
      )}
    </div>
  );
}
