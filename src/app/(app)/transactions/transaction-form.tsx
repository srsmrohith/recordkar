"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { TreatmentPreview } from "@/components/treatment-preview";
import { TxnFields } from "@/components/txn-fields";
import { openingConflict, type OpeningConflict } from "@/lib/engine/counting";
import { hasIssues, validateDraft } from "@/lib/engine/treatment";
import type { MasterData, TxnDraft } from "@/lib/engine/types";
import { formatDate, inr } from "@/lib/format";
import { blockedMessage, changeOpeningHref } from "@/lib/opening-notes";
import { deleteTransaction, postManualTransaction, updateTransaction, type PostResult } from "./actions";

type Props = {
  master: MasterData;
  initial: TxnDraft;
  /** Present when editing a posted transaction. */
  transactionId?: string;
  fieldsMode?: "manual" | "queue";
};

const draftKey = () => `rk:draft:${window.location.pathname}`;

/** Manual entry: fill form → see proposed Dr/Cr inline → Review & Post (bypasses the Queue, §2). */
export function TransactionForm({ master, initial, transactionId, fieldsMode = "manual" }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const issues = useMemo(() => validateDraft(draft, master), [draft, master]);
  const editing = Boolean(transactionId);
  // Dated before an account's opening balance date: blocked here and in the database.
  const conflict = useMemo(() => openingConflict(draft, master), [draft, master]);
  const blocked: OpeningConflict | null = conflict ?? (result && !result.ok && "openingConflict" in result ? (result.openingConflict ?? null) : null);

  // Coming back from "Change opening balance": restore what was being typed.
  useEffect(() => {
    const key = draftKey();
    const saved = sessionStorage.getItem(key);
    if (!saved) return;
    // Remove only once restored: React may run this effect twice (cancelling the first timer).
    const t = setTimeout(() => {
      sessionStorage.removeItem(key);
      setDraft(JSON.parse(saved) as TxnDraft);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function changeOpeningBalance(c: OpeningConflict) {
    sessionStorage.setItem(draftKey(), JSON.stringify(draft));
    router.push(changeOpeningHref(c.accountId, draft.txnDate, window.location.pathname + window.location.search));
  }

  const change = (next: TxnDraft) => {
    setDraft(next);
    setResult(null);
  };

  function submit(allowDuplicate = false) {
    setSubmitted(true);
    if (hasIssues(issues) || conflict) return;
    startTransition(async () => {
      const r = editing ? await updateTransaction(transactionId!, draft) : await postManualTransaction(draft, allowDuplicate);
      setResult(r);
      if (r.ok) router.push(`/transactions?notice=${editing ? "saved" : "posted"}`);
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteTransaction(transactionId!);
      if (r.ok) router.push("/transactions?notice=deleted");
      else setResult({ ok: false, error: r.error ?? "Couldn't delete." });
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="card">
        <TxnFields draft={draft} onChange={change} master={master} issues={issues} showIssues={submitted} mode={fieldsMode} />
      </div>

      <TreatmentPreview draft={draft} master={master} />

      {blocked ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-3 text-sm" role="alert">
          <p>{blockedMessage(blocked)}</p>
          <button type="button" className="btn-secondary mt-2" onClick={() => changeOpeningBalance(blocked)}>
            Change opening balance
          </button>
        </div>
      ) : (
        result && !result.ok && "error" in result && <p className="field-error text-sm" role="alert">{result.error}</p>
      )}

      {result && !result.ok && "duplicate" in result && (
        <div className="rounded-lg bg-warn-bg px-3 py-3 text-sm text-warn-ink" role="alert">
          <p className="font-medium">⚠ Possible duplicate</p>
          <p className="mt-1">
            {result.duplicate.kind === "queue" ? "An imported item awaiting review" : "A posted transaction"} on{" "}
            {formatDate(result.duplicate.txn_date)} for {inr(result.duplicate.amount)} ({result.duplicate.label}) looks like the same
            transaction. One real-world transaction should be recorded only once.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => submit(true)} disabled={pending}>
              It&apos;s different — post anyway
            </button>
            <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending || Boolean(conflict) || (submitted && hasIssues(issues))}>
          {pending ? "Posting…" : editing ? "Review & Save changes" : "Review & Post"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
        {editing && (
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-ink-2">Delete this transaction?</span>
                <button type="button" className="btn-danger" onClick={remove} disabled={pending}>Yes, delete</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>No</button>
              </>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
            )}
          </div>
        )}
      </div>
      {editing && <p className="text-xs text-ink-3">Every change is recorded in the Edit log with before and after values.</p>}
    </form>
  );
}
