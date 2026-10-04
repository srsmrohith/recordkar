// Pure import planning: which uploaded rows are skipped, which are flagged as possible duplicates,
// and what the import summary says. The import action supplies what's already recorded.
import { findFuzzyDuplicate, type DuplicateCandidate } from "./duplicates";
import type { Issues } from "./treatment";
import type { MasterData, TxnDraft } from "./types";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Keys identifying "this reference on this account". A row is keyed by its resolved account and,
 * always, by the account text exactly as written in the file — so a row whose account isn't
 * recognised (e.g. "HDFC Bnk") is still caught when the same file is uploaded again.
 */
export function referenceKeys(accountId: string | null, rawAccount: string | null | undefined, reference: string | null | undefined): string[] {
  if (!reference || !reference.trim()) return [];
  const ref = norm(reference);
  const keys: string[] = [];
  if (accountId) keys.push(`acct:${accountId}|${ref}`);
  if (rawAccount && rawAccount.trim()) keys.push(`raw:${norm(rawAccount)}|${ref}`);
  return keys;
}

export type PlanInput = {
  draft: TxnDraft;
  issues: Issues;
  /** Account text as written in the file. */
  rawAccount: string | null;
};

export type RowPlan = {
  skip: boolean;
  duplicate: DuplicateCandidate | null;
  needsInfo: boolean;
};

export type ImportSummary = {
  total: number;
  queued: number;
  skipped: number;
  needsInfo: number;
  flagged: number;
};

export function planImport(
  rows: PlanInput[],
  ctx: { recordedKeys: Set<string>; candidates: DuplicateCandidate[]; master: MasterData },
): { plans: RowPlan[]; summary: ImportSummary } {
  const seen = new Set(ctx.recordedKeys);
  const summary: ImportSummary = { total: rows.length, queued: 0, skipped: 0, needsInfo: 0, flagged: 0 };

  const plans = rows.map((row): RowPlan => {
    const keys = referenceKeys(row.draft.accountId, row.rawAccount, row.draft.reference);
    const isRepeat = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    if (isRepeat) {
      summary.skipped++;
      return { skip: true, duplicate: null, needsInfo: false };
    }

    const duplicate = findFuzzyDuplicate(row.draft, ctx.candidates);
    const needsInfo = Object.keys(row.issues).length > 0;
    summary.queued++;
    if (needsInfo) summary.needsInfo++;
    if (duplicate) summary.flagged++;
    return { skip: false, duplicate, needsInfo };
  });

  return { plans, summary };
}

/** Canonical fingerprint of a file's rows, to recognise the same file uploaded again. */
export function fileFingerprint(rows: Record<string, string | undefined>[]): string {
  return JSON.stringify(
    rows
      .map((r) =>
        JSON.stringify(
          Object.keys(r)
            .filter((k) => r[k] !== undefined && r[k] !== "")
            .sort()
            .map((k) => [k, r[k]]),
        ),
      )
      .sort(),
  );
}

export type PreviousImport = { fileName: string; createdAt: string; fingerprint: string | null };

/** An earlier import of the same file: same file name (case-insensitive) or identical rows. */
export function findPreviousImport(
  fileName: string,
  fingerprint: string,
  previous: PreviousImport[],
): PreviousImport | null {
  const name = fileName.trim().toLowerCase();
  return (
    previous.find((p) => p.fileName.trim().toLowerCase() === name || (p.fingerprint !== null && p.fingerprint === fingerprint)) ??
    null
  );
}
