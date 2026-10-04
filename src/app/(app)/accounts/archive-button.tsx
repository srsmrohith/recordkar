"use client";

import { useState, useTransition } from "react";
import { inr } from "@/lib/format";
import { setAccountArchived } from "./actions";

/** Archive / Restore with a confirmation step. Archiving is refused unless the balance is ₹0. */
export function ArchiveButton({
  id,
  name,
  archived,
  balance,
  isCard,
}: {
  id: string;
  name: string;
  archived: boolean;
  balance: number;
  isCard: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (nextArchived: boolean) =>
    startTransition(async () => {
      const r = await setAccountArchived(id, nextArchived);
      setError(r.ok ? null : (r.error ?? "Couldn't update the account."));
      setConfirming(false);
    });

  if (archived) {
    return (
      <button className="btn-ghost text-xs" disabled={pending} onClick={() => run(false)}>
        Restore
      </button>
    );
  }

  const nonZero = Math.round(balance * 100) !== 0;

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        nonZero ? (
          <div className="max-w-64 text-right text-xs text-warn-ink" role="alert">
            {isCard
              ? `This card still has ${inr(Math.abs(balance))} outstanding. Pay it off or adjust it to zero first.`
              : `Move or adjust the remaining ${inr(Math.abs(balance))} first.`}{" "}
            Only accounts at ₹0 can be archived.
            <button className="ml-1 font-medium underline" onClick={() => setConfirming(false)}>OK</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-ink-2">Archive {name}? Its history stays.</span>
            <button className="btn-danger px-2 py-1 text-xs" disabled={pending} onClick={() => run(true)}>Archive</button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        )
      ) : (
        <button className="btn-ghost text-xs" onClick={() => setConfirming(true)}>Archive</button>
      )}
      {error && <p className="max-w-64 text-right text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
