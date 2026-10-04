import type { Metadata } from "next";
import Link from "next/link";
import { loadMaster } from "@/lib/data";
import { describeEntry, type AuditEntry } from "@/lib/edit-log";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { TransactionsTabs } from "../tabs";

export const metadata: Metadata = { title: "Edit log" };

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/i;

const ACTION_LABELS = { create: "Posted", update: "Edited", delete: "Deleted" } as const;

export default async function EditLogPage({ searchParams }: PageProps<"/transactions/edit-log">) {
  const sp = await searchParams;
  const transactionId = typeof sp.transaction === "string" && UUID.test(sp.transaction) ? sp.transaction : null;
  const before = typeof sp.before === "string" && /^\d+$/.test(sp.before) ? Number(sp.before) : null;

  const { supabase } = await requireUser();
  // The Edit log is stored in the audit_history table.
  let query = supabase
    .from("audit_history")
    .select("id, entity_id, action, before, after, changed_at")
    .eq("entity", "transaction")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (transactionId) query = query.eq("entity_id", transactionId);
  if (before) query = query.lt("id", before);

  const [master, log] = await Promise.all([loadMaster(supabase), query]);
  if (log.error) throw new Error(log.error.message);

  const entries = (log.data as AuditEntry[]).slice(0, PAGE_SIZE);
  const hasMore = log.data.length > PAGE_SIZE;

  // Which transactions still exist (deleted ones keep their log but have nothing to open).
  const ids = [...new Set(entries.map((e) => e.entity_id))];
  const existing = ids.length
    ? await supabase.from("transactions").select("id").in("id", ids)
    : { data: [] as { id: string }[], error: null };
  if (existing.error) throw new Error(existing.error.message);
  const live = new Set(existing.data.map((t) => t.id));

  const olderHref = `/transactions/edit-log?${new URLSearchParams({
    ...(transactionId ? { transaction: transactionId } : {}),
    before: String(entries.at(-1)?.id ?? ""),
  })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>
      <TransactionsTabs active="edit-log" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-2">
            {transactionId
              ? "Every change to this transaction, newest first."
              : "Every transaction posted, edited or deleted, newest first. Times are India time."}
          </p>
        </div>
        {transactionId && (
          <div className="flex gap-2">
            {live.has(transactionId) && (
              <Link href={`/transactions/${transactionId}`} className="btn-secondary">Open transaction</Link>
            )}
            <Link href="/transactions/edit-log" className="btn-ghost">Full Edit log</Link>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="card text-center text-sm text-ink-2">
          {transactionId ? "No Edit log entries for this transaction." : "Nothing in the Edit log yet."}
        </div>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => {
            const item = describeEntry(entry, master);
            const isLive = live.has(entry.entity_id);
            return (
              <li key={entry.id} className="card space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      entry.action === "delete"
                        ? "bg-danger/10 text-danger"
                        : entry.action === "update"
                          ? "bg-warn-bg text-warn-ink"
                          : "bg-brand/10 text-brand"
                    }`}
                  >
                    {ACTION_LABELS[entry.action]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                  <time dateTime={entry.changed_at} className="text-xs text-ink-3">{formatDateTime(entry.changed_at)}</time>
                </div>

                <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
                  {item.rows.map((row, i) => (
                    <div key={i} className="contents">
                      <dt className="text-ink-3">{row.label}</dt>
                      <dd className="min-w-0 break-words tabular">
                        {row.value ?? (
                          <>
                            <span className="text-ink-3 line-through decoration-ink-3/50">{row.from}</span>
                            <span className="mx-1.5 text-ink-3" aria-hidden="true">→</span>
                            <span className="sr-only"> changed to </span>
                            <span className="font-medium">{row.to}</span>
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>

                {!transactionId && (
                  <div className="flex gap-3 text-xs">
                    <Link href={`/transactions/edit-log?transaction=${entry.entity_id}`} className="text-brand">
                      All changes to this transaction
                    </Link>
                    {isLive ? (
                      <Link href={`/transactions/${entry.entity_id}`} className="text-brand">Open</Link>
                    ) : (
                      <span className="text-ink-3">Transaction deleted</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {hasMore && (
        <div className="text-center">
          <Link href={olderHref} className="btn-secondary">Older entries</Link>
        </div>
      )}
    </div>
  );
}
