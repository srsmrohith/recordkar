"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatDate, inr, todayIso } from "@/lib/format";
import { addOpeningBalance, type AccountFormState } from "./actions";

type Opening = { transactionId: string; amount: number; date: string } | null;

/** "Opening balance ₹X as of <date> · Edit", or an inline form to add one. */
export function OpeningBalance({ accountId, isCard, opening }: { accountId: string; isCard: boolean; opening: Opening }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addOpeningBalance.bind(null, accountId), {} as AccountFormState);
  const label = isCard ? "Opening outstanding" : "Opening balance";

  if (opening) {
    return (
      <p className="text-xs text-ink-3">
        {label} {inr(opening.amount)} as of {formatDate(opening.date)} ·{" "}
        <Link href={`/transactions/${opening.transactionId}`} className="font-medium text-brand">Edit</Link>
      </p>
    );
  }

  if (!adding || state.ok) {
    return (
      <p className="text-xs text-ink-3">
        No {label.toLowerCase()} ·{" "}
        <button type="button" className="font-medium text-brand" onClick={() => setAdding(true)}>Add</button>
      </p>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={`ob-amount-${accountId}`} className="label">{label} (₹)</label>
        <input id={`ob-amount-${accountId}`} name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required className="input w-36 py-1.5 tabular" />
      </div>
      <div>
        <label htmlFor={`ob-date-${accountId}`} className="label">Balance as of</label>
        <input id={`ob-date-${accountId}`} name="asOf" type="date" defaultValue={todayIso()} required className="input w-auto py-1.5" />
      </div>
      <button className="btn-primary py-1.5" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      <button type="button" className="btn-ghost py-1.5" onClick={() => setAdding(false)}>Cancel</button>
      <p className="w-full text-xs text-ink-3">Choose the day before the earliest transaction you plan to import.</p>
      {state.error && <p className="field-error w-full" role="alert">{state.error}</p>}
    </form>
  );
}
