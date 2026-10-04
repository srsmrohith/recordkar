"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { friendlyDbError, loadMaster } from "@/lib/data";
import { loadDuplicateCandidates } from "@/lib/duplicates-server";
import { parseTemplateCsv, resolveRow } from "@/lib/engine/csv";
import { findFuzzyDuplicate } from "@/lib/engine/duplicates";
import { draftToRow } from "@/lib/engine/treatment";
import { requireUser } from "@/lib/supabase/server";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "done"; fileName: string; total: number; queued: number; skipped: number; flagged: number; needsInfo: number };

const MAX_BYTES = 2 * 1024 * 1024;
const refKey = (accountId: string, ref: string) => `${accountId}|${ref.trim().toLowerCase()}`;

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
  const master = await loadMaster(supabase);
  const resolved = parsed.rows.map((r) => ({ ...r, ...resolveRow(r.raw, master) }));

  // Exact duplicates: same account + same reference, already recorded or earlier in this file.
  const accountIds = [...new Set(resolved.map((r) => r.draft.accountId).filter((x): x is string => Boolean(x)))];
  const noRows = Promise.resolve({ data: [] as { account_id: string | null; reference: string | null }[], error: null });
  const [refs, queuedRefs] = accountIds.length === 0
    ? [await noRows, await noRows]
    : await Promise.all([
        supabase.from("transaction_references").select("account_id, reference").in("account_id", accountIds),
        supabase.from("transaction_queue").select("account_id, reference").in("account_id", accountIds).neq("status", "discarded").not("reference", "is", null),
      ]);
  if (refs.error || queuedRefs.error) return { status: "error", error: (refs.error ?? queuedRefs.error)!.message };
  const seen = new Set([...refs.data, ...queuedRefs.data].map((r) => refKey(r.account_id!, r.reference!)));

  const candidates = await loadDuplicateCandidates(supabase, resolved.map((r) => r.draft));

  const batchId = randomUUID();
  const externals = [];
  const queueRows = [];
  let skipped = 0;
  let flagged = 0;
  let needsInfo = 0;

  for (const r of resolved) {
    const externalId = randomUUID();
    externals.push({ id: externalId, import_batch_id: batchId, row_number: r.rowNumber, raw: r.raw });

    const { draft } = r;
    if (draft.accountId && draft.reference) {
      const key = refKey(draft.accountId, draft.reference);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
    }

    const dup = findFuzzyDuplicate(draft, candidates);
    if (dup) flagged++;
    if (Object.keys(r.issues).length > 0) needsInfo++;

    queueRows.push({
      import_batch_id: batchId,
      external_transaction_id: externalId,
      ...draftToRow(draft),
      person_text: r.personText,
      group_text: r.groupText,
      issues: r.issues,
      duplicate_of_transaction_id: dup?.kind === "transaction" ? dup.id : null,
      duplicate_of_queue_id: dup?.kind === "queue" ? dup.id : null,
    });
  }

  const batch = await supabase.from("import_batches").insert({
    id: batchId,
    file_name: file.name.slice(0, 200),
    total_rows: resolved.length,
    queued_rows: queueRows.length,
    skipped_duplicate_rows: skipped,
  });
  if (batch.error) return { status: "error", error: friendlyDbError(batch.error) };

  const ext = await supabase.from("external_transactions").insert(externals);
  if (ext.error) return { status: "error", error: friendlyDbError(ext.error) };

  if (queueRows.length > 0) {
    const q = await supabase.from("transaction_queue").insert(queueRows);
    if (q.error) return { status: "error", error: friendlyDbError(q.error) };
  }

  revalidatePath("/", "layout");
  return { status: "done", fileName: file.name, total: resolved.length, queued: queueRows.length, skipped, flagged, needsInfo };
}
