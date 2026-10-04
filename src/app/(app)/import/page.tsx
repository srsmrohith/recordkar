import type { Metadata } from "next";
import { loadMaster } from "@/lib/data";
import { REQUIRED_COLUMNS, TEMPLATE_COLUMNS } from "@/lib/engine/csv";
import { TXN_TYPES } from "@/lib/engine/types";
import { formatDate, isoDateInIndia } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Import file" };

export default async function ImportPage() {
  const { supabase } = await requireUser();
  const [master, batches] = await Promise.all([
    loadMaster(supabase),
    supabase.from("import_batches").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  const active = <T extends { archived?: boolean; name: string }>(l: T[]) => l.filter((x) => !x.archived).map((x) => x.name);
  const lists: [string, string[]][] = [
    ["Account", active(master.accounts)],
    ["Transaction Type", [...TXN_TYPES]],
    ["Debit/Credit", ["DEBIT", "CREDIT"]],
    ["Category — expenses & refunds", active(master.categories)],
    ["Category — income", active(master.incomeHeads)],
    ["Event", active(master.events)],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Import file</h1>

      <section className="card space-y-2 text-sm">
        <h2 className="text-sm font-semibold">1. Download the template</h2>
        <p className="text-ink-2">
          Fill one row per transaction and save as CSV. Required: {REQUIRED_COLUMNS.join(", ")}. Dates as YYYY-MM-DD or
          DD/MM/YYYY. Amounts are always positive; Debit/Credit gives the direction (Debit = money out or card charge).
          For transfers, the other account is asked during review. Person and Group are kept and linked once People
          &amp; Groups are available.
        </p>
        <a href="/import/template" className="btn-secondary" download>Download template (CSV)</a>
      </section>

      <section className="space-y-2">
        <UploadForm />
        <p className="text-xs text-ink-3">
          Uploaded rows are never posted directly — they wait in the Queue for your review and approval.
        </p>
      </section>

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">Allowed values (template lists)</summary>
        <p className="mt-2 text-xs text-ink-3">Columns: {TEMPLATE_COLUMNS.join(" · ")}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {lists.map(([label, values]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-ink-2">{label}</dt>
              <dd className="text-ink-3">{values.length ? values.join(", ") : "None yet"}</dd>
            </div>
          ))}
        </dl>
      </details>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Import history</h2>
        {batches.data && batches.data.length > 0 ? (
          <>
          {/* Phones: one card per import so every count is visible without scrolling sideways. */}
          <ul className="space-y-2 sm:hidden">
            {batches.data.map((b) => (
              <li key={b.id} className="card space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 break-all font-medium">{b.file_name}</span>
                  <span className="text-xs text-ink-3">{formatDate(isoDateInIndia(b.created_at))}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center tabular">
                  {[
                    ["Rows", b.total_rows],
                    ["Queued", b.queued_rows],
                    ["Skipped", b.skipped_duplicate_rows],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-surface-2 py-1.5">
                      <dt className="text-xs text-ink-3">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface sm:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-4 py-2 font-medium">Uploaded</th>
                  <th className="px-4 py-2 text-right font-medium">Rows</th>
                  <th className="px-4 py-2 text-right font-medium">Queued</th>
                  <th className="px-4 py-2 text-right font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {batches.data.map((b) => (
                  <tr key={b.id}>
                    <td className="max-w-48 truncate px-4 py-2">{b.file_name}</td>
                    <td className="px-4 py-2">{formatDate(isoDateInIndia(b.created_at))}</td>
                    <td className="px-4 py-2 text-right">{b.total_rows}</td>
                    <td className="px-4 py-2 text-right">{b.queued_rows}</td>
                    <td className="px-4 py-2 text-right">{b.skipped_duplicate_rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="text-sm text-ink-3">No imports yet.</p>
        )}
      </section>
    </div>
  );
}
