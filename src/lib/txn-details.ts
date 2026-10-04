// The "More details" section of a transaction (description, event, value date, reference, notes).
import type { Issues } from "@/lib/engine/treatment";
import type { MasterData, TxnDraft } from "@/lib/engine/types";
import { formatDate } from "@/lib/format";

type DetailsDraft = Pick<TxnDraft, "description" | "eventId" | "valueDate" | "reference" | "notes">;

/**
 * Whether "More details" starts open. Queue cards start collapsed (nearly every imported row has a
 * reference, so opening on content made every card very tall) unless a field inside needs fixing.
 * The manual form opens when editing a transaction that already has details.
 */
export function detailsOpenByDefault(mode: "manual" | "queue", draft: DetailsDraft, issues: Issues = {}): boolean {
  if (issues.event) return true;
  if (mode === "queue") return false;
  return Boolean(draft.eventId || draft.notes || draft.valueDate || draft.reference);
}

/** Compact one-line summary of the collapsed details, e.g. "Auto ride · Ref REF101 · Case 1". */
export function detailsSummary(draft: DetailsDraft, master: Pick<MasterData, "events">): string | null {
  const event = draft.eventId ? master.events.find((e) => e.id === draft.eventId)?.name : null;
  const parts = [
    draft.description?.trim(),
    event ? `Event: ${event}` : null,
    draft.valueDate ? `Value date ${formatDate(draft.valueDate)}` : null,
    draft.reference?.trim() ? `Ref ${draft.reference.trim()}` : null,
    draft.notes?.trim(),
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" · ") : null;
}
