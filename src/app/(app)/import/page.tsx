import type { Metadata } from "next";
import { loadMaster } from "@/lib/data";
import { REQUIRED_COLUMNS, TEMPLATE_COLUMNS } from "@/lib/engine/csv";
import { TXN_TYPES } from "@/lib/engine/types";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { ImportHistory } from "./import-history";
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
          <ImportHistory
            batches={batches.data.map((b) => ({
              id: b.id,
              fileName: b.file_name,
              uploadedAt: formatDateTime(b.created_at),
              total: b.total_rows,
              queued: b.queued_rows,
              skipped: b.skipped_duplicate_rows,
            }))}
          />
        ) : (
          <p className="text-sm text-ink-3">No imports yet.</p>
        )}
      </section>
    </div>
  );
}
