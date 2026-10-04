"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ACCOUNT_TYPE_LABELS, todayIso } from "@/lib/format";
import { createAccount, type AccountFormState } from "./actions";

export function AccountForm() {
  const [state, action, pending] = useActionState(createAccount, {} as AccountFormState);
  const [type, setType] = useState("bank");
  const formRef = useRef<HTMLFormElement>(null);

  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setType("bank");
  }
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const isCard = type === "credit_card";

  return (
    <form ref={formRef} action={action} className="card space-y-3">
      <h2 className="text-sm font-semibold">Add account</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="acct-name" className="label">Name</label>
          <input id="acct-name" name="name" required maxLength={80} placeholder="e.g. HDFC Savings" className="input" />
        </div>
        <div>
          <label htmlFor="acct-type" className="label">Type</label>
          <select id="acct-type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="acct-opening" className="label">{isCard ? "Outstanding on that date (₹)" : "Balance on that date (₹)"}</label>
          <input id="acct-opening" name="opening" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0" className="input tabular" />
        </div>
        <div>
          <label htmlFor="acct-asof" className="label">Balance as of</label>
          <input
            id="acct-asof"
            name="asOf"
            type="date"
            defaultValue={todayIso()}
            className="input"
            aria-describedby="acct-asof-hint"
          />
          <p id="acct-asof-hint" className="mt-1 text-xs text-ink-3">
            Choose the day before the earliest transaction you plan to import.
          </p>
        </div>
      </div>
      <p className="text-xs text-ink-3">
        Saved as the account&apos;s opening balance — not income, and not counted in any month&apos;s surplus. You can edit it
        later.
      </p>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {state.ok && (
        <p className="text-sm font-medium text-brand" role="status">✓ Account added</p>
      )}
      <button className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add account"}</button>
    </form>
  );
}
