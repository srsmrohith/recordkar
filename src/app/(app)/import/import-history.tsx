"use client";

import Link from "next/link";
import { useState } from "react";
import { loadImportRows, type ImportRowDetail } from "./actions";

export type BatchSummary = {
  id: string;
  fileName: string;
  uploadedAt: string; // already formatted in India time
  total: number;
  queued: number;
  skipped: number;
};

const BADGE: Record<ImportRowDetail["outcome"]["kind"], string> = {
  skipped: "bg-surface-2 text-ink-2",
  in_queue: "bg-warn-bg text-warn-ink",
  posted: "bg-brand/10 text-brand",
  discarded: "bg-surface-2 text-ink-3",
};

/** Import history; each import expands to show what happened to every uploaded row, and why. */
export function ImportHistory({ batches }: { batches: BatchSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, ImportRowDetail[] | { error: string } | "loading">>({});

  async function toggle(id: string) {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && !rows[next]) {
      setRows((r) => ({ ...r, [next]: "loading" }));
      const res = await loadImportRows(next);
      setRows((r) => ({ ...r, [next]: res.ok ? res.rows : { error: res.error } }));
    }
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {batches.map((b) => {
        const isOpen = open === b.id;
        const detail = rows[b.id];
        return (
          <li key={b.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`batch-${b.id}`}
              onClick={() => toggle(b.id)}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-surface-2 sm:grid-cols-[1fr_auto_auto]"
            >
              <span className="min-w-0">
                <span className="block break-all font-medium">
                  <span aria-hidden="true" className="mr-1.5 inline-block w-3 text-ink-3">{isOpen ? "▾" : "▸"}</span>
                  {b.fileName}
                </span>
                <span className="block pl-[1.125rem] text-xs text-ink-3">Uploaded {b.uploadedAt}</span>
              </span>
              <span className="col-span-2 pl-[1.125rem] text-xs text-ink-2 tabular sm:col-span-1 sm:pl-0 sm:text-right">
                {b.total} rows · {b.queued} queued · {b.skipped} skipped
              </span>
            </button>

            {isOpen && (
              <div id={`batch-${b.id}`} className="border-t border-border bg-bg/50 px-4 py-3">
                {detail === "loading" || detail === undefined ? (
                  <p className="text-sm text-ink-3">Loading rows…</p>
                ) : "error" in detail ? (
                  <p className="field-error">{detail.error}</p>
                ) : (
                  <ol className="space-y-2">
                    {detail.map((r) => (
                      <li key={r.rowNumber} className="grid grid-cols-[3.5rem_1fr] gap-x-2 text-sm sm:grid-cols-[3.5rem_1fr_auto]">
                        <span className="text-xs text-ink-3 tabular">Row {r.rowNumber}</span>
                        <span className="min-w-0">
                          <span className="block break-words">
                            {r.label}
                            <span className="text-ink-3">
                              {" "}· {r.date ?? "no date"} · {r.direction ?? ""} {r.amount ? `₹${r.amount}` : ""}
                            </span>
                          </span>
                          <span className="block text-xs text-ink-2">
                            {r.outcome.reason}
                            {r.transactionId && (
                              <>
                                {" · "}
                                <Link href={`/transactions/${r.transactionId}`} className="text-brand">Open</Link>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="col-start-2 flex flex-wrap items-start gap-1 self-start pt-1 sm:col-start-3 sm:justify-end sm:pt-0">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[r.outcome.kind]}`}>
                            {r.outcome.label}
                          </span>
                          {r.outcome.flagged && (
                            <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn-ink">⚠ Flagged</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
