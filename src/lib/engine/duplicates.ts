import type { TxnDraft } from "./types";

/** Fuzzy duplicate window (Recordkar §2): date within ±2 days, amount exact, similar text. */
export const DUPLICATE_WINDOW_DAYS = 2;
const SIMILARITY_THRESHOLD = 0.5;

export type DuplicateCandidate = {
  id: string;
  kind: "transaction" | "queue";
  account_id: string | null;
  amount: number | string | null;
  txn_date: string | null;
  merchant: string | null;
  description: string | null;
};

const STOPWORDS = new Set(["upi", "neft", "imps", "rtgs", "pos", "ach", "txn", "ref", "to", "from", "by", "the", "payment"]);

export function tokens(text: string | null | undefined): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

/** Token overlap in [0, 1]; containment counts as a full match ("Swiggy" vs "Swiggy Bangalore"). */
export function textSimilarity(a: string | null, b: string | null): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const cents = (n: number | string) => Math.round(Number(n) * 100);
const label = (merchant: string | null, description: string | null) =>
  [merchant, description].filter(Boolean).join(" ");

/**
 * The first candidate that likely records the same real-world transaction, or null.
 * Matches are only ever flagged for the user — never dropped automatically.
 */
export function findFuzzyDuplicate(
  draft: Pick<TxnDraft, "accountId" | "amount" | "txnDate" | "merchant" | "description">,
  candidates: DuplicateCandidate[],
): DuplicateCandidate | null {
  if (!draft.accountId || draft.amount === null || !draft.txnDate) return null;
  const day = dayNumber(draft.txnDate);
  const text = label(draft.merchant, draft.description);

  for (const c of candidates) {
    if (c.account_id !== draft.accountId || c.amount === null || !c.txn_date) continue;
    if (cents(c.amount) !== cents(draft.amount)) continue;
    if (Math.abs(dayNumber(c.txn_date) - day) > DUPLICATE_WINDOW_DAYS) continue;
    const other = label(c.merchant, c.description);
    // When either side has no usable text, amount + account + date is enough to ask.
    if (tokens(text).size === 0 || tokens(other).size === 0) return c;
    if (textSimilarity(text, other) >= SIMILARITY_THRESHOLD) return c;
  }
  return null;
}

/** ISO date range to fetch candidates for a set of dates. */
export function candidateDateRange(dates: string[]): { from: string; to: string } | null {
  const days = dates.filter(Boolean).map(dayNumber);
  if (days.length === 0) return null;
  const toIso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
  return {
    from: toIso(Math.min(...days) - DUPLICATE_WINDOW_DAYS),
    to: toIso(Math.max(...days) + DUPLICATE_WINDOW_DAYS),
  };
}

export type ReferenceCandidate = DuplicateCandidate & { reference: string | null };

/** Same account + same reference (case-insensitive) — the strongest duplicate signal. */
export function findReferenceMatch(
  draft: Pick<TxnDraft, "accountId" | "reference">,
  candidates: ReferenceCandidate[],
): ReferenceCandidate | null {
  const ref = draft.reference?.trim().toLowerCase();
  if (!draft.accountId || !ref) return null;
  return candidates.find((c) => c.account_id === draft.accountId && c.reference?.trim().toLowerCase() === ref) ?? null;
}

export type StoredDuplicateFlag = {
  duplicate_of_transaction_id: string | null;
  duplicate_of_queue_id: string | null;
  duplicate_reviewed: boolean;
};

/**
 * What to store after re-checking a Queue item. A flag the user already answered ("Keep") stays
 * answered unless the match itself changes; a new match is always asked about again.
 */
export function duplicateFlagUpdate(
  stored: StoredDuplicateFlag,
  found: Pick<DuplicateCandidate, "id" | "kind"> | null,
): { changed: boolean; fields: StoredDuplicateFlag } {
  const txn = found?.kind === "transaction" ? found.id : null;
  const queue = found?.kind === "queue" ? found.id : null;
  if (txn === stored.duplicate_of_transaction_id && queue === stored.duplicate_of_queue_id) {
    return { changed: false, fields: stored };
  }
  return {
    changed: true,
    fields: { duplicate_of_transaction_id: txn, duplicate_of_queue_id: queue, duplicate_reviewed: false },
  };
}
