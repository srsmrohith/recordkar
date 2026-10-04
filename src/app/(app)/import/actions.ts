"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster } from "@/lib/data";
import { loadDuplicateCandidates } from "@/lib/duplicates-server";
import { parseTemplateCsv, resolveRow, type RawRow } from "@/lib/engine/csv";
import {
  fileFingerprint,
  findPreviousImport,
  planImport,
  referenceKeys,
  type ImportSummary,
  type PreviousImport,
} from "@/lib/engine/import-plan";
import { draftToRow } from "@/lib/engine/treatment";
import { formatDate, isoDateInIndia } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "confirm"; fileName: string; importedOn: string }
  | ({ status: "done"; fileName: string } & ImportSummary);

const MAX_BYTES = 2 * 1024 * 1024;

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Earlier imports that could be this same file: same name, or same row count (compared by content). */
async function loadPreviousImports(supabase: Supabase, rowCount: number): Promise<PreviousImport[]> {
  const batches = await supabase
    .from("import_batches")
    .select("id, file_name, created_at, total_rows")
    .order("created_at", { ascending: false })
    .limit(50);
  if (batches.error) throw new Error(batches.error.message);

  const sameSize = batches.data.filter((b) => b.total_rows === rowCount).slice(0, 20);
  const rawByBatch = new Map<string, RawRow[]>();
  if (sameSize.length) {
    const ext = await supabase
      .from("external_transactions")
      .select("import_batch_id, raw")
      .in("import_batch_id", sameSize.map((b) => b.id));
    if (ext.error) throw new Error(ext.error.message);
    for (const e of ext.data) {
      const list = rawByBatch.get(e.import_batch_id) ?? [];
      list.push(e.raw as RawRow);
      rawByBatch.set(e.import_batch_id, list);
    }
  }
  return batches.data.map((b) => ({
    fileName: b.file_name,
    createdAt: b.created_at,
    fingerprint: rawByBatch.has(b.id) ? fileFingerprint(rawByBatch.get(b.id)!) : null,
  }));
}

/**
 * "This reference on this account" keys already recorded: posted transaction references, plus
 * Queue items that weren't discarded — keyed by resolved account and by the account text from the
 * original file, so rows with an unrecognised account are still recognised on a second upload.
 */
async function loadRecordedKeys(supabase: Supabase, accountIds: string[], references: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  if (references.length === 0) return keys;

  const [refs, queued, ext] = await Promise.all([
    accountIds.length
      ? supabase.from("transaction_references").select("account_id, reference").in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; reference: string }[], error: null }),
    accountIds.length
      ? supabase
          .from("transaction_queue")
          .select("account_id, reference")
          .in("account_id", accountIds)
          .neq("status", "discarded")
          .not("reference", "is", null)
      : Promise.resolve({ data: [] as { account_id: string | null; reference: string | null }[], error: null }),
    supabase.from("external_transactions").select("id, raw").in("raw->>Reference", references),
  ]);
  for (const r of [refs, queued, ext]) if (r.error) throw new Error(r.error.message);

  for (const r of [...(refs.data ?? []), ...(queued.data ?? [])]) {
    referenceKeys(r.account_id, null, r.reference).forEach((k) => keys.add(k));
  }

  // Raw-account keys only count while the row they came from is still in the Queue (pending or posted).
  const extRows = ext.data ?? [];
  if (extRows.length) {
    const live = await supabase
      .from("transaction_queue")
      .select("external_transaction_id")
      .in("external_transaction_id", extRows.map((e) => e.id))
      .neq("status", "discarded");
    if (live.error) throw new Error(live.error.message);
    const liveIds = new Set(live.data.map((q) => q.external_transaction_id));
    for (const e of extRows) {
      if (!liveIds.has(e.id)) continue;
      const raw = e.raw as RawRow;
      referenceKeys(null, raw.Account, raw.Reference).forEach((k) => keys.add(k));
    }
  }
  return keys;
}

/**
 * Template → Upload → Import Validation → External Transaction → Duplicate Check → Queue (Rupevo §3).
 * Nothing here posts: every row waits in the Queue for review and approval.
 */
export async function importCsv(_: ImportState, form: FormData): Promise<ImportState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", error: "Choose a CSV file to upload." };
  if (file.size > MAX_BYTES) return { status: "error", error: "The file is larger than 2 MB." };
  if (!/\.csv$/i.test(file.name)) return { status: "error", error: "Upload a .csv file (save the template as CSV)." };

  const parsed = parseTemplateCsv(await file.text());
  if (!parsed.ok) return { status: "error", error: parsed.error };
  if (parsed.rows.length === 0) return { status: "error", error: "The file has no transaction rows." };

  const { supabase } = await requireUser();

  try {
    // Same file uploaded before? Ask first, unless the user already confirmed.
    if (form.get("confirmReimport") !== "1") {
      const previous = findPreviousImport(
        file.name,
        fileFingerprint(parsed.rows.map((r) => r.raw)),
        await loadPreviousImports(supabase, parsed.rows.length),
      );
      if (previous) {
        return { status: "confirm", fileName: file.name, importedOn: formatDate(isoDateInIndia(previous.createdAt)) };
      }
    }

    const master = await loadMaster(supabase);
    const resolved = parsed.rows.map((r) => ({ ...r, ...resolveRow(r.raw, master) }));
    const accountIds = [...new Set(resolved.map((r) => r.draft.accountId).filter((x): x is string => Boolean(x)))];
    const references = [...new Set(resolved.map((r) => r.draft.reference?.trim()).filter((x): x is string => Boolean(x)))];

    const [recordedKeys, candidates] = await Promise.all([
      loadRecordedKeys(supabase, accountIds, references),
      loadDuplicateCandidates(supabase, resolved.map((r) => r.draft)),
    ]);
    const { plans, summary } = planImport(
      resolved.map((r) => ({ draft: r.draft, issues: r.issues, rawAccount: r.raw.Account ?? null })),
      { recordedKeys, candidates, master },
    );

    const batchId = randomUUID();
    const externals = [];
    const queueRows = [];
    for (const [i, r] of resolved.entries()) {
      const externalId = randomUUID();
      externals.push({ id: externalId, import_batch_id: batchId, row_number: r.rowNumber, raw: r.raw });
      const plan = plans[i];
      if (plan.skip) continue;
      queueRows.push({
        import_batch_id: batchId,
        external_transaction_id: externalId,
        ...draftToRow(r.draft),
        person_text: r.personText,
        group_text: r.groupText,
        issues: r.issues,
        duplicate_of_transaction_id: plan.duplicate?.kind === "transaction" ? plan.duplicate.id : null,
        duplicate_of_queue_id: plan.duplicate?.kind === "queue" ? plan.duplicate.id : null,
      });
    }

    const batch = await supabase.from("import_batches").insert({
      id: batchId,
      file_name: file.name.slice(0, 200),
      total_rows: summary.total,
      queued_rows: summary.queued,
      skipped_duplicate_rows: summary.skipped,
    });
    if (batch.error) return { status: "error", error: friendlyDbError(batch.error) };

    const ext = await supabase.from("external_transactions").insert(externals);
    if (ext.error) return { status: "error", error: friendlyDbError(ext.error) };

    if (queueRows.length > 0) {
      const q = await supabase.from("transaction_queue").insert(queueRows);
      if (q.error) return { status: "error", error: friendlyDbError(q.error) };
    }

    revalidatePath("/", "layout");
    return { status: "done", fileName: file.name, ...summary };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Import failed." };
  }
}
