// Per-row outcome of an import, for Import history: what happened to each uploaded row, and why.
import type { SkipReason } from "./import-plan";
import { draftFromRow, hasIssues, validateDraft, type DraftRow, type Issues } from "./treatment";
import type { MasterData } from "./types";

export type QueueRowState = DraftRow & {
  status: "pending" | "posted" | "discarded";
  issues: Issues | null;
  duplicate_of_transaction_id: string | null;
  duplicate_of_queue_id: string | null;
  duplicate_reviewed: boolean;
  posted_transaction_id: string | null;
};

export type RowOutcome = {
  kind: "skipped" | "in_queue" | "posted" | "discarded";
  label: string;
  reason: string;
  /** Flagged as a possible duplicate (at import or later on its Queue card). */
  flagged: boolean;
};

const SKIP_REASONS: Record<SkipReason, string> = {
  in_file: "Repeated earlier in this file (same account and reference)",
  already_recorded: "Already recorded (same account and reference)",
};

export function rowOutcome(
  skipReason: SkipReason | null,
  queue: QueueRowState | null,
  master: MasterData,
): RowOutcome {
  if (!queue) {
    return {
      kind: "skipped",
      label: "Skipped",
      reason: skipReason ? SKIP_REASONS[skipReason] : "Duplicate (reason not recorded for imports before 05 Oct 2026)",
      flagged: false,
    };
  }

  const flagged = Boolean(queue.duplicate_of_transaction_id || queue.duplicate_of_queue_id);
  if (queue.status === "posted") {
    return {
      kind: "posted",
      label: "Posted",
      reason: flagged && queue.duplicate_reviewed ? "Approved after you marked it as not a duplicate" : "Approved from the Queue",
      flagged,
    };
  }
  if (queue.status === "discarded") {
    return {
      kind: "discarded",
      label: "Discarded",
      reason: flagged ? "Discarded — it was flagged as a possible duplicate" : "Discarded in the Queue",
      flagged,
    };
  }

  // Still in the Queue: say what's holding it up.
  const reasons: string[] = [];
  if (flagged && !queue.duplicate_reviewed) reasons.push("Possible duplicate — choose Keep or Discard");
  const issues = { ...validateDraft(draftFromRow(queue), master) };
  // Prefer the import-time explanation (e.g. "No account named …") for fields still missing.
  for (const [field, message] of Object.entries(queue.issues ?? {})) {
    if (field in issues) issues[field as keyof Issues] = message;
  }
  if (hasIssues(issues)) reasons.push(...Object.values(issues).filter((m): m is string => Boolean(m)));
  return {
    kind: "in_queue",
    label: "In Queue",
    reason: reasons.length ? reasons.join("; ") : "Ready to approve",
    flagged,
  };
}
