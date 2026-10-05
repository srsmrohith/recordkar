import Link from "next/link";
import { formatDate, inr } from "@/lib/format";
import { accountNote, changeOpeningHref } from "@/lib/opening-notes";

type Opening = { amount: number; date: string } | null;

/**
 * The account's opening balance (the start of its records) with Edit/Add, and — when some
 * transactions are dated before it — the note that they aren't counted.
 */
export function OpeningBalance({
  accountId,
  isCard,
  opening,
  uncountedCount,
}: {
  accountId: string;
  isCard: boolean;
  opening: Opening;
  uncountedCount: number;
}) {
  const label = isCard ? "Opening outstanding" : "Opening balance";
  const href = changeOpeningHref(accountId, null, "/accounts");

  return (
    <div className="space-y-1">
      {opening ? (
        <p className="text-xs text-ink-3">
          {label} {inr(opening.amount)} at the start of {formatDate(opening.date)} ·{" "}
          <Link href={href} className="font-medium text-brand">Edit</Link>
        </p>
      ) : (
        <p className="text-xs text-ink-3">
          No {label.toLowerCase()} ·{" "}
          <Link href={href} className="font-medium text-brand">Add</Link>
        </p>
      )}
      {opening && uncountedCount > 0 && (
        <div className="rounded-lg bg-warn-bg px-2.5 py-2 text-xs text-warn-ink">
          <p>{accountNote(uncountedCount, opening.date)}</p>
          <Link href={href} className="mt-1 inline-block font-medium underline">Change opening balance</Link>
        </div>
      )}
    </div>
  );
}
