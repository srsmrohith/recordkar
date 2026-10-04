import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, isoDateInIndia } from "@/lib/format";

/**
 * "Imported from <file> on <date>" for transactions that were approved from the Queue.
 *
 * When a Queue item is approved, its status change (with import_batch_id and posted_transaction_id)
 * is recorded in the audit_history table. Reading that record — rather than the live Queue row,
 * whose link is cleared when the transaction is deleted — keeps the source for deleted transactions too.
 */
export async function loadImportSources(supabase: SupabaseClient, transactionIds: string[]): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  if (transactionIds.length === 0) return sources;

  const posted = await supabase
    .from("audit_history")
    .select("after")
    .eq("entity", "queue_item")
    .in("after->>posted_transaction_id", transactionIds);
  if (posted.error) throw new Error(posted.error.message);

  const batchByTxn = new Map<string, string>();
  for (const row of posted.data) {
    const after = row.after as { posted_transaction_id?: string; import_batch_id?: string } | null;
    if (after?.posted_transaction_id && after.import_batch_id) batchByTxn.set(after.posted_transaction_id, after.import_batch_id);
  }
  const batchIds = [...new Set(batchByTxn.values())];
  if (batchIds.length === 0) return sources;

  const batches = await supabase.from("import_batches").select("id, file_name, created_at").in("id", batchIds);
  if (batches.error) throw new Error(batches.error.message);
  const label = new Map(
    batches.data.map((b) => [b.id, `Imported from ${b.file_name} on ${formatDate(isoDateInIndia(b.created_at))}`]),
  );
  for (const [txn, batch] of batchByTxn) {
    const text = label.get(batch);
    if (text) sources.set(txn, text);
  }
  return sources;
}
