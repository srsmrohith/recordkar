import Link from "next/link";
import { changeOpeningHref, importNote } from "@/lib/opening-notes";
import type { BeforeOpening } from "./actions";

/** "N transactions are dated before <account>'s opening balance date…" with a Change opening balance button. */
export function BeforeOpeningNotes({ groups }: { groups: BeforeOpening[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.accountId} className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink" role="note">
          <p>{importNote(g)}</p>
          <Link href={changeOpeningHref(g.accountId, null, "/import")} className="btn-secondary mt-2">
            Change opening balance
          </Link>
        </div>
      ))}
    </div>
  );
}
