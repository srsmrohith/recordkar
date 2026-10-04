"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { TreatmentPreview } from "@/components/treatment-preview";
import { TxnFields } from "@/components/txn-fields";
import { textSimilarity } from "@/lib/engine/duplicates";
import { allowedCounterKinds, hasIssues, validateDraft, type Issues } from "@/lib/engine/treatment";
import { TXN_TYPES, type Counter, type MasterData, type TxnDraft, type UserTxnType } from "@/lib/engine/types";
import { formatDate, inr, TXN_TYPE_LABELS } from "@/lib/format";
import { preserveScrollAcrossRefresh } from "@/lib/scroll";
import {
  approveQueueItem,
  bulkApprove,
  bulkSetClassification,
  discardQueueItems,
  keepDespiteDuplicate,
  saveQueueItem,
} from "./actions";

export type QueueItem = {
  id: string;
  draft: TxnDraft;
  importIssues: Issues;
  personText: string | null;
  groupText: string | null;
  duplicate: {
    kind: "transaction" | "queue";
    txn_date: string | null;
    amount: number;
    merchant: string | null;
    description: string | null;
  } | null;
};

const label = (d: TxnDraft) => [d.merchant, d.description].filter(Boolean).join(" ");

/** Items that look like the same kind of transaction (e.g. 20 Swiggy debits) for bulk actions. */
function isSimilar(a: TxnDraft, b: TxnDraft) {
  if (a.direction !== b.direction) return false;
  const ma = a.merchant?.trim().toLowerCase();
  const mb = b.merchant?.trim().toLowerCase();
  if (ma && mb) return ma === mb;
  return textSimilarity(label(a), label(b)) >= 0.5;
}

export function QueueList({ items, master }: { items: QueueItem[]; master: MasterData }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() => new Map(items.map((i) => [i.id, i.draft])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Pick up server changes (after approve/bulk edits) when the item list is refreshed.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setDrafts(new Map(items.map((i) => [i.id, i.draft])));
    setSelected((s) => new Set([...s].filter((id) => items.some((i) => i.id === id))));
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  function selectSimilar(id: string) {
    const base = drafts.get(id)!;
    setSelected(new Set(items.filter((i) => isSimilar(base, drafts.get(i.id)!)).map((i) => i.id)));
  }

  // Bulk and card actions revalidate the page, which can jump to the top; keep the reader's place.
  const restoreScroll = useRef<(() => void) | null>(null);
  const rememberScroll = () => {
    restoreScroll.current = preserveScrollAcrossRefresh();
  };
  useEffect(() => {
    if (!pending && restoreScroll.current) {
      restoreScroll.current();
      restoreScroll.current = null;
    }
  }, [pending, items]);

  const run = (fn: () => Promise<string | null | void>) => {
    rememberScroll();
    startTransition(async () => {
      try {
        const msg = await fn();
        setMessage(msg ?? null);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
      router.refresh();
    });
  };

  const allSelected = selected.size === items.length;

  return (
    <div className="space-y-3">
      <div className="sticky top-[57px] z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>
          {/* Phones: actions collapse behind one button so the sticky bar stays one line. */}
          {selected.size > 0 && (
            <button
              type="button"
              className="btn-secondary ml-auto py-1.5 sm:hidden"
              aria-expanded={actionsOpen}
              aria-controls="queue-bulk-actions"
              onClick={() => setActionsOpen(!actionsOpen)}
            >
              Actions {actionsOpen ? "▴" : "▾"}
            </button>
          )}
        </div>
        {selected.size > 0 && (
          <div
            id="queue-bulk-actions"
            className={`${actionsOpen ? "flex" : "hidden"} w-full flex-col items-stretch gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center`}
          >
            <BulkClassify
              master={master}
              disabled={pending}
              onApply={(type, counter) => run(() => bulkSetClassification([...selected], type, counter).then(() => "Updated selected items."))}
            />
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await bulkApprove([...selected]);
                  setSelected(new Set(r.failed.map((f) => f.id)));
                  return r.failed.length
                    ? `Posted ${r.posted}. ${r.failed.length} still need attention (left selected): ${r.failed[0].reason}${r.failed.length > 1 ? "…" : ""}`
                    : `Posted ${r.posted}.`;
                })
              }
            >
              Approve & post selected
            </button>
            <button className="btn-ghost" disabled={pending} onClick={() => run(() => discardQueueItems([...selected]).then(() => "Discarded."))}>
              Discard selected
            </button>
          </div>
        )}
        {message && <p className="w-full text-xs text-ink-2" role="status">{message}</p>}
      </div>

      {items.map((item) => (
        <QueueCard
          key={item.id}
          item={item}
          draft={drafts.get(item.id)!}
          master={master}
          selected={selected.has(item.id)}
          onSelect={(on) => toggle(item.id, on)}
          onSelectSimilar={() => selectSimilar(item.id)}
          onBeforeAction={rememberScroll}
          onChange={(d) => setDrafts((m) => new Map(m).set(item.id, d))}
          onDone={(msg) => {
            if (msg) setMessage(msg);
            router.refresh();
          }}
        />
      ))}
    </div>
  );
}

function BulkClassify({ master, disabled, onApply }: { master: MasterData; disabled: boolean; onApply: (t: UserTxnType, c: Counter | null) => void }) {
  const [type, setType] = useState<UserTxnType>("EXPENSE");
  const [counter, setCounter] = useState("");
  const kinds = allowedCounterKinds(type);
  return (
    <div className="flex flex-wrap items-center gap-1.5 [&>select]:flex-1 sm:[&>select]:flex-none">
      <label className="sr-only" htmlFor="bulk-type">Type for selected</label>
      <select id="bulk-type" className="input w-auto py-1.5" value={type} onChange={(e) => { setType(e.target.value as UserTxnType); setCounter(""); }}>
        {TXN_TYPES.map((t) => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
      </select>
      {(kinds.includes("category") || kinds.includes("income_head")) && (
        <>
          <label className="sr-only" htmlFor="bulk-counter">Category for selected</label>
          <select id="bulk-counter" className="input w-auto py-1.5" value={counter} onChange={(e) => setCounter(e.target.value)}>
            <option value="">Category…</option>
            {kinds.includes("category") && master.categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={`category:${c.id}`}>{c.name}</option>)}
            {kinds.includes("income_head") && master.incomeHeads.filter((c) => !c.archived).map((c) => <option key={c.id} value={`income_head:${c.id}`}>{c.name}</option>)}
          </select>
        </>
      )}
      <button
        className="btn-secondary"
        disabled={disabled}
        onClick={() => {
          const [kind, id] = counter.split(":");
          onApply(type, counter ? ({ kind, id } as Counter) : null);
        }}
      >
        Apply
      </button>
    </div>
  );
}

function QueueCard({
  item,
  draft,
  master,
  selected,
  onSelect,
  onSelectSimilar,
  onChange,
  onDone,
  onBeforeAction,
}: {
  item: QueueItem;
  draft: TxnDraft;
  master: MasterData;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onSelectSimilar: () => void;
  onChange: (d: TxnDraft) => void;
  onDone: (message?: string) => void;
  onBeforeAction: () => void;
}) {
  const issues = useMemo(() => validateDraft(draft, master), [draft, master]);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);

  function change(next: TxnDraft) {
    onChange(next);
    latest.current = next;
    setError(null);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveQueueItem(item.id, latest.current);
      setSaveState(r.ok ? "saved" : "error");
      if (!r.ok) setError(r.error ?? "Couldn't save.");
    }, 600);
  }

  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const ready = !hasIssues(issues) && !item.duplicate;
  const act = (fn: () => Promise<{ ok: boolean; error?: string } | void>, successMessage?: string) => {
    onBeforeAction();
    startTransition(async () => {
      if (timer.current) clearTimeout(timer.current);
      try {
        const r = await fn();
        if (r && !r.ok) setError(r.error ?? "Something went wrong.");
        else onDone(successMessage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  return (
    <article className={`card space-y-3 ${selected ? "ring-2 ring-brand/40" : ""}`} aria-label={`Imported transaction ${label(draft) || ""}`}>
      <header className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{draft.merchant || draft.description || "Imported transaction"}</p>
          <p className="text-xs text-ink-3">
            {formatDate(draft.txnDate)} · {draft.direction === "CREDIT" ? "Credit" : draft.direction === "DEBIT" ? "Debit" : "?"}{" "}
            {draft.amount !== null ? inr(draft.amount) : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            item.duplicate ? "bg-warn-bg text-warn-ink" : ready ? "bg-brand/10 text-brand" : "bg-surface-2 text-ink-2"
          }`}
        >
          {item.duplicate ? "⚠ Possible duplicate" : ready ? "✓ Ready" : `Needs ${Object.keys(issues).length} detail${Object.keys(issues).length === 1 ? "" : "s"}`}
        </span>
      </header>

      {item.duplicate && (
        <div className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          Looks like {item.duplicate.kind === "queue" ? "another imported item" : "an existing transaction"}:{" "}
          {formatDate(item.duplicate.txn_date)}, {inr(item.duplicate.amount)},{" "}
          {[item.duplicate.merchant, item.duplicate.description].filter(Boolean).join(" · ") || "no description"}.
          <div className="mt-2 flex gap-2">
            <button className="btn-secondary" disabled={pending} onClick={() => act(() => keepDespiteDuplicate(item.id))}>Keep — it&apos;s different</button>
            <button className="btn-ghost" disabled={pending} onClick={() => act(() => discardQueueItems([item.id]), "Discarded")}>Discard as duplicate</button>
          </div>
        </div>
      )}

      <TxnFields draft={draft} onChange={change} master={master} issues={issues} showIssues importIssues={item.importIssues} mode="queue" />

      {(item.personText || item.groupText) && (
        <p className="text-xs text-ink-3">
          From file: {item.personText && <>Person “{item.personText}”</>}
          {item.personText && item.groupText && " · "}
          {item.groupText && <>Group “{item.groupText}”</>} — linked once People &amp; Groups are available.
        </p>
      )}

      <TreatmentPreview draft={draft} master={master} />

      {error && <p className="field-error" role="alert">{error}</p>}

      <footer className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!ready || pending} onClick={() => act(() => approveQueueItem(item.id, draft), "Posted")}>
          {pending ? "Posting…" : "Approve & post"}
        </button>
        <button className="btn-ghost" disabled={pending} onClick={() => act(() => discardQueueItems([item.id]), "Discarded")}>Discard</button>
        <button className="btn-ghost text-xs" onClick={onSelectSimilar}>Select similar</button>
        <span className="ml-auto text-xs text-ink-3" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : ""}
        </span>
      </footer>
    </article>
  );
}
