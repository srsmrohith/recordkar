"use client";

import { useId, useState } from "react";
import { allowedCounterKinds, counterLabel, fixedDirection, normalizeDraft, type Issues } from "@/lib/engine/treatment";
import { TXN_TYPES, type Counter, type MasterData, type TxnDraft, type TxnType } from "@/lib/engine/types";
import { TXN_TYPE_LABELS } from "@/lib/format";

type Props = {
  draft: TxnDraft;
  onChange: (next: TxnDraft) => void;
  master: MasterData;
  /** Live validation messages; shown once `showIssues` is true or the field was imported with a problem. */
  issues: Issues;
  showIssues: boolean;
  /** Import-time messages (e.g. "No account named 'X'"), preferred over generic ones. */
  importIssues?: Issues;
  /**
   * manual: transfers are entered as From/To and direction is hidden where implied.
   * queue: direction is always visible because it is statement evidence.
   */
  mode: "manual" | "queue";
  /** Start with "More details" open. */
  detailsOpen?: boolean;
};

const encodeCounter = (c: Counter | null) => (!c ? "" : c.kind === "system" ? `system:${c.head}` : `${c.kind}:${c.id}`);

function decodeCounter(value: string): Counter | null {
  if (!value) return null;
  const [kind, id] = value.split(":") as [Counter["kind"], string];
  if (kind === "system") return { kind, head: id as "opening_balance" | "balance_adjustment" };
  return { kind, id } as Counter;
}

/** Active options, plus the currently selected one even if archived. */
const visible = <T extends { id: string; archived?: boolean }>(list: T[], selected: string | null | undefined) =>
  list.filter((x) => !x.archived || x.id === selected);

export function TxnFields({ draft, onChange, master, issues, showIssues, importIssues = {}, mode, detailsOpen }: Props) {
  const uid = useId();
  const [moreOpen, setMoreOpen] = useState(
    detailsOpen ?? Boolean(draft.eventId || draft.notes || draft.valueDate || draft.reference),
  );
  const set = (patch: Partial<TxnDraft>) => onChange({ ...draft, ...patch });
  const msg = (field: keyof Issues) => (issues[field] ? importIssues[field] ?? (showIssues ? issues[field] : undefined) : undefined);
  const cls = (field: keyof Issues) => `input ${msg(field) ? "input-error" : ""}`;

  const type = draft.type;
  const isOpening = type === "OPENING_BALANCE";
  const manualTransfer = mode === "manual" && type === "TRANSFER";
  const showDirection = !isOpening && !manualTransfer && (mode === "queue" || !fixedDirection(type));
  const kinds = allowedCounterKinds(type);
  const counterId = draft.counter && draft.counter.kind !== "system" ? draft.counter.id : null;
  const acctCard = master.accounts.find((a) => a.id === draft.accountId)?.type === "credit_card";

  function changeType(next: TxnType | null) {
    // Re-derive implied fields; keep the counter only if it is still valid for the new type.
    const base = { ...draft, type: next };
    const implied = fixedDirection(next);
    if (implied) base.direction = implied;
    else if (mode === "manual") {
      // Manual transfers are entered From → To (a DEBIT on the From account). For Adjustment/Other,
      // a direction that was only implied by the previous type is cleared so the user is asked.
      const previousWasImplied = Boolean(fixedDirection(draft.type)) || draft.type === "TRANSFER";
      base.direction = next === "TRANSFER" ? "DEBIT" : previousWasImplied ? null : draft.direction;
    }
    onChange(normalizeDraft(base));
  }

  const id = (name: string) => `${uid}-${name}`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={id("type")} className="label">Type</label>
          {isOpening ? (
            <p className="input bg-surface-2">{TXN_TYPE_LABELS.OPENING_BALANCE}</p>
          ) : (
            <select id={id("type")} className={cls("type")} value={type ?? ""} onChange={(e) => changeType((e.target.value || null) as TxnType | null)}>
              <option value="">Choose…</option>
              {TXN_TYPES.map((t) => (
                <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>
              ))}
            </select>
          )}
          {msg("type") && <p className="field-error">{msg("type")}</p>}
        </div>
        <div>
          <label htmlFor={id("date")} className="label">Date</label>
          <input id={id("date")} type="date" className={cls("txnDate")} value={draft.txnDate ?? ""} onChange={(e) => set({ txnDate: e.target.value || null })} />
          {msg("txnDate") && <p className="field-error">{msg("txnDate")}</p>}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={id("amount")} className="label">Amount (₹)</label>
          <input
            id={id("amount")}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className={`${cls("amount")} tabular`}
            value={draft.amount ?? ""}
            onChange={(e) => set({ amount: e.target.value === "" ? null : Number(e.target.value) })}
          />
          {msg("amount") && <p className="field-error">{msg("amount")}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id("account")} className="label">{manualTransfer ? "From account" : "Account"}</label>
          {/* An opening balance belongs to its account; it can't be moved to another one. */}
          <select
            id={id("account")}
            className={cls("account")}
            value={draft.accountId ?? ""}
            disabled={isOpening}
            onChange={(e) => set({ accountId: e.target.value || null })}
          >
            <option value="">Choose…</option>
            {visible(master.accounts, draft.accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {msg("account") && <p className="field-error">{msg("account")}</p>}
        </div>

        {showDirection && (
          <div>
            <label htmlFor={id("direction")} className="label">Debit / Credit</label>
            <select id={id("direction")} className={cls("direction")} value={draft.direction ?? ""} onChange={(e) => set({ direction: (e.target.value || null) as TxnDraft["direction"] })}>
              <option value="">Choose…</option>
              <option value="DEBIT">Debit — money out{acctCard ? " / adds to card dues" : ""}</option>
              <option value="CREDIT">Credit — money in{acctCard ? " / reduces card dues" : ""}</option>
            </select>
            {msg("direction") && <p className="field-error">{msg("direction")}</p>}
          </div>
        )}

        {kinds.length > 0 && kinds[0] !== "system" && (
          <div>
            <label htmlFor={id("counter")} className="label">{manualTransfer ? "To account" : counterLabel(type, draft.direction)}</label>
            <select id={id("counter")} className={cls("counter")} value={encodeCounter(draft.counter)} onChange={(e) => set({ counter: decodeCounter(e.target.value) })}>
              <option value="">Choose…</option>
              {kinds.includes("category") && (
                <optgroup label="Expense categories">
                  {visible(master.categories, counterId).map((c) => (
                    <option key={c.id} value={`category:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {kinds.includes("income_head") && (
                <optgroup label="Income heads">
                  {visible(master.incomeHeads, counterId).map((h) => (
                    <option key={h.id} value={`income_head:${h.id}`}>{h.name}</option>
                  ))}
                </optgroup>
              )}
              {kinds.includes("account") && (
                <optgroup label="Accounts">
                  {visible(master.accounts, counterId)
                    .filter((a) => a.id !== draft.accountId)
                    .map((a) => (
                      <option key={a.id} value={`account:${a.id}`}>{a.name}</option>
                    ))}
                </optgroup>
              )}
            </select>
            {msg("counter") && <p className="field-error">{msg("counter")}</p>}
          </div>
        )}

        {!isOpening && (
          <div>
            <label htmlFor={id("merchant")} className="label">Merchant</label>
            <input id={id("merchant")} className="input" value={draft.merchant ?? ""} onChange={(e) => set({ merchant: e.target.value || null })} />
          </div>
        )}
      </div>

      {mode === "queue" && draft.description && !moreOpen && (
        <p className="truncate text-xs text-ink-3" title={draft.description}>{draft.description}</p>
      )}

      <div>
        <button type="button" className="text-xs font-medium text-brand" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
          {moreOpen ? "− Fewer details" : "+ More details"}
        </button>
        {moreOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={id("description")} className="label">Description</label>
              <input id={id("description")} className="input" value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} />
            </div>
            <div>
              <label htmlFor={id("event")} className="label">Event / occasion</label>
              <select id={id("event")} className={cls("event")} value={draft.eventId ?? ""} onChange={(e) => set({ eventId: e.target.value || null })}>
                <option value="">None</option>
                {visible(master.events, draft.eventId).map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
              {msg("event") && <p className="field-error">{msg("event")}</p>}
            </div>
            <div>
              <label htmlFor={id("valueDate")} className="label">Value date</label>
              <input id={id("valueDate")} type="date" className="input" value={draft.valueDate ?? ""} onChange={(e) => set({ valueDate: e.target.value || null })} />
            </div>
            <div>
              <label htmlFor={id("reference")} className="label">Reference</label>
              <input id={id("reference")} className="input" value={draft.reference ?? ""} onChange={(e) => set({ reference: e.target.value || null })} />
            </div>
            <div>
              <label htmlFor={id("notes")} className="label">Notes</label>
              <input id={id("notes")} className="input" value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
