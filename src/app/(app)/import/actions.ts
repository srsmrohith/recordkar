"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster } from "@/lib/data";
import { loadDuplicateCandidates } from "@/lib/duplicates-server";
import { groupBeforeOpening, type OpeningConflict } from "@/lib/engine/counting";
import { parseTemplateCsv, resolveRow, type RawRow } from "@/lib/engine/csv";
import {
  fileFingerprint,
  findPreviousImport,
  planImport,
  referenceKeys,
  type ImportSummary,
  type SkipReason,
  type PreviousImport,
} from "@/lib/engine/import-plan";
import { rowOutcome, type QueueRowState, type RowOutcome } from "@/lib/engine/import-outcome";
import { draftFromRow, draftToRow } from "@/lib/engine/treatment";
import { formatDate, isoDateInIndia } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "confirm"; fileName: string; importedOn: string }
  | ({ status: "done"; fileName: string; beforeOpening: BeforeOpening[] } & ImportSummary);

/** Queued rows dated before their account's opening balance date (approvable, but not counted). */
export type BeforeOpening = OpeningConflict & { count: number };

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
      const plan = plans[i];
      externals.push({ id: externalId, import_batch_id: batchId, row_number: r.rowNumber, raw: r.raw, skip_reason: plan.skip });
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

    let ext = await supabase.from("external_transactions").insert(externals);
    // Before migration 20261005000100 the skip_reason column doesn't exist; import without it rather
    // than fail (Import history then shows "reason not recorded" for those skipped rows).
    if (ext.error && /skip_reason/.test(ext.error.message)) {
      ext = await supabase.from("external_transactions").insert(externals.map(({ id, import_batch_id, row_number, raw }) => ({ id, import_batch_id, row_number, raw })));
    }
    if (ext.error) return { status: "error", error: friendlyDbError(ext.error) };

    if (queueRows.length > 0) {
      const q = await supabase.from("transaction_queue").insert(queueRows);
      if (q.error) return { status: "error", error: friendlyDbError(q.error) };
    }

    revalidatePath("/", "layout");
    const queuedDrafts = resolved.filter((_, i) => !plans[i].skip).map((r) => r.draft);
    return { status: "done", fileName: file.name, ...summary, beforeOpening: groupBeforeOpening(queuedDrafts, master) };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Import failed." };
  }
}

export type ImportRowDetail = {
  rowNumber: number;
  date: string | null;
  label: string;
  amount: string | null;
  direction: string | null;
  outcome: RowOutcome;
  transactionId: string | null;
};

/** Per-row outcomes for one import, for the expandable Import history. */
export async function loadImportRows(
  batchId: string,
): Promise<{ ok: true; rows: ImportRowDetail[]; beforeOpening: BeforeOpening[] } | { ok: false; error: string }> {
  const { supabase } = await requireUser();
  let ext = await supabase
    .from("external_transactions")
    .select("id, row_number, raw, skip_reason")
    .eq("import_batch_id", batchId)
    .order("row_number");
  if (ext.error && /skip_reason/.test(ext.error.message)) {
    // Migration 20261005000100 not run yet.
    ext = (await supabase
      .from("external_transactions")
      .select("id, row_number, raw")
      .eq("import_batch_id", batchId)
      .order("row_number")) as typeof ext;
  }
  if (ext.error) return { ok: false, error: friendlyDbError(ext.error) };

  const [queue, master] = await Promise.all([
    supabase.from("transaction_queue").select("*").eq("import_batch_id", batchId),
    loadMaster(supabase),
  ]);
  if (queue.error) return { ok: false, error: friendlyDbError(queue.error) };
  // Posted rows link to their transaction only while it still exists (deleted ones keep their outcome).
  const postedIds = queue.data.map((q) => q.posted_transaction_id).filter(Boolean);
  const live = postedIds.length ? await supabase.from("transactions").select("id").in("id", postedIds) : { data: [] };
  const byExternal = new Map(queue.data.map((q) => [q.external_transaction_id, q as QueueRowState]));
  const liveIds = new Set((live.data ?? []).map((t) => t.id));

  const rows = ext.data.map((e) => {
    const raw = e.raw as RawRow;
    const q = byExternal.get(e.id) ?? null;
    const skip = ((e as { skip_reason?: SkipReason | null }).skip_reason ?? null) as SkipReason | null;
    return {
      rowNumber: e.row_number,
      date: raw["Transaction Date"] ?? null,
      label: [raw.Merchant, raw.Description].filter(Boolean).join(" · ") || raw.Account || "—",
      amount: raw.Amount ?? null,
      direction: raw["Debit/Credit"] ?? null,
      outcome: rowOutcome(skip, q, master),
      transactionId: q?.posted_transaction_id && liveIds.has(q.posted_transaction_id) ? q.posted_transaction_id : null,
    };
  });
  // Rows still in the Queue or posted that are dated before their account's opening balance date.
  const kept = queue.data.filter((q) => q.status !== "discarded").map((q) => draftFromRow(q as QueueRowState));
  return { ok: true, rows, beforeOpening: groupBeforeOpening(kept, master) };
}
