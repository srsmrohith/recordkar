"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatDate, inr, todayIso } from "@/lib/format";
import { previewOpening, saveOpening, type OpeningPreviewResult, type PreviewItem } from "./actions";

type Props = {
  accountId: string;
  accountName: string;
  isCard: boolean;
  current: { date: string; amount: number } | null;
  initialDate: string | null;
  returnTo: string;
};

function ItemList({ items }: { items: PreviewItem[] }) {
  return (
    <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs">
      {items.map((t) => (
        <li key={t.id} className="flex justify-between gap-3">
          <span className="min-w-0 truncate">
            {formatDate(t.date)} · {t.label}
          </span>
          <span className="shrink-0 tabular">
            {t.out ? "−" : "+"}
            {inr(t.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OpeningBalanceForm({ accountId, accountName, isCard, current, initialDate, returnTo }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate ?? todayIso());
  const [amount, setAmount] = useState(current ? String(current.amount) : "");
  const [preview, setPreview] = useState<OpeningPreviewResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amountLabel = isCard ? "Outstanding" : "Balance";

  // Live preview of what changes (debounced).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await previewOpening(accountId, date, Number(amount));
      if (!cancelled) {
        setPreview(r);
        setConfirmed(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [accountId, date, amount]);

  const ok = preview?.ok ? preview : null;
  const needsConfirm = ok ? ok.move === "earlier" || ok.stopCounting.length > 0 : false;

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveOpening(accountId, date, Number(amount), confirmed);
      if (r.ok) router.push(returnTo);
      else setError(r.error);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="card space-y-3">
        <p className="text-sm text-ink-2">
          The opening balance date is where {accountName}&apos;s records start: the {amountLabel.toLowerCase()} before that
          day&apos;s transactions. Transactions dated earlier are kept but not counted.
        </p>
        {current && (
          <p className="text-xs text-ink-3">
            Currently {inr(current.amount)} at the start of {formatDate(current.date)}.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ob-date" className="label">Opening balance date</label>
            <input id="ob-date" type="date" max={todayIso()} required value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="ob-amount" className="label">{amountLabel} at the start of that day (₹)</label>
            <input
              id="ob-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input tabular"
              aria-describedby="ob-amount-hint"
            />
            <p id="ob-amount-hint" className="mt-1 text-xs text-ink-3">
              {amountLabel} at the start of {formatDate(date)}
            </p>
          </div>
        </div>
      </div>

      {preview && !preview.ok && amount !== "" && <p className="field-error">{preview.error}</p>}

      {ok && (
        <div className="space-y-3 rounded-lg bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
          <p>
            Current {isCard ? "outstanding" : "balance"} changes from <strong className="tabular">{inr(ok.currentBalance)}</strong> to{" "}
            <strong className="tabular">{inr(ok.newBalance)}</strong>
            {ok.startCounting.length > 0 &&
              `; ${ok.startCounting.length} transaction${ok.startCounting.length === 1 ? "" : "s"} start${ok.startCounting.length === 1 ? "s" : ""} counting`}
            .
          </p>
          {ok.startCounting.length > 0 && <ItemList items={ok.startCounting} />}

          {ok.stopCounting.length > 0 && (
            <div className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">
              <p className="font-medium">
                {ok.stopCounting.length} transaction{ok.stopCounting.length === 1 ? "" : "s"} will stop counting:
              </p>
              <ItemList items={ok.stopCounting} />
            </div>
          )}

          {needsConfirm && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                {ok.move === "earlier"
                  ? `I've re-checked: ${inr(Number(amount))} was the ${amountLabel.toLowerCase()} at the start of ${formatDate(date)}.`
                  : `Stop counting the ${ok.stopCounting.length} transaction${ok.stopCounting.length === 1 ? "" : "s"} listed above.`}
                {ok.move === "earlier" && ok.stopCounting.length > 0 && " The listed transactions will stop counting."}
              </span>
            </label>
          )}
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending || !ok || (needsConfirm && !confirmed)}>
          {pending ? "Saving…" : current ? "Save opening balance" : "Add opening balance"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push(returnTo)}>Cancel</button>
      </div>
      <p className="text-xs text-ink-3">The change is recorded in the Edit log, and every entry stays balanced.</p>
    </form>
  );
}
