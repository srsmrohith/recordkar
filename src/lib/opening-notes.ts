// User-facing wording for transactions dated before an account's opening balance date.
// Shared by server pages and client components (no server-only imports here).
import type { OpeningConflict } from "@/lib/engine/counting";
import { formatDate } from "@/lib/format";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Manual entry / edit blocked. Names the account (important for transfers). */
export function blockedMessage(c: OpeningConflict): string {
  return `${c.accountName}'s records start on ${formatDate(c.openingDate)} (its opening balance date). Transactions before then can't be added — use a later date, or change ${c.accountName}'s opening balance.`;
}

/** Amber note on a Queue card for an imported row dated before its account's opening date. */
export function queueNote(c: OpeningConflict): string {
  return `Dated before ${c.accountName}'s opening balance date (${formatDate(c.openingDate)}). It won't be counted. To count it, update the opening balance date and amount.`;
}

/** Import summary / Import history note, per account. */
export function importNote(c: OpeningConflict & { count: number }): string {
  return `${c.count} ${plural(c.count, "transaction is", "transactions are")} dated before ${c.accountName}'s opening balance date (${formatDate(c.openingDate)}) and won't be counted. To count ${plural(c.count, "it", "them")}, update the opening balance date and amount.`;
}

/** Under an account on the Accounts page. */
export function accountNote(count: number, openingDate: string): string {
  return `${count} ${plural(count, "transaction is", "transactions are")} dated before the opening balance date (${formatDate(openingDate)}) and ${plural(count, "isn't", "aren't")} counted. To count ${plural(count, "it", "them")}, update the opening balance date and amount.`;
}

/** One quiet line on the Dashboard and reports. */
export function summaryNote(count: number): string {
  return `${count} ${plural(count, "transaction", "transactions")} before opening balance dates ${plural(count, "isn't", "aren't")} counted.`;
}

/** Greyed Transactions-list row label. */
export const LIST_LABEL = "Before opening balance date, not counted";

/**
 * Link to change an account's opening balance, with the date pre-filled, returning to `returnTo`
 * afterwards. Only same-site paths are allowed as the return target.
 */
export function changeOpeningHref(accountId: string, date: string | null, returnTo: string): string {
  const p = new URLSearchParams();
  if (date) p.set("date", date);
  p.set("returnTo", safeReturnTo(returnTo));
  return `/accounts/${accountId}/opening-balance?${p}`;
}

/** A same-site path to return to; anything else (absolute or protocol-relative URLs) falls back to Accounts. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/accounts";
}
