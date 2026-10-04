"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { importCsv, type ImportState } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(importCsv, { status: "idle" } as ImportState);
  const [, startTransition] = useTransition();
  // React resets the form after each submit, which clears the file input; keep the chosen file so
  // "Import again" can resend it after the duplicate-file warning.
  const [file, setFile] = useState<File | null>(null);
  const [dismissed, setDismissed] = useState<ImportState | null>(null);
  const confirming = state.status === "confirm" && dismissed !== state;

  function importAgain() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("confirmReimport", "1");
    startTransition(() => action(fd));
  }

  return (
    <div className="space-y-3">
      <form action={action} className="card space-y-3">
        <h2 className="text-sm font-semibold">2. Upload your completed file</h2>
        <div>
          <label htmlFor="file" className="label">CSV file</label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm"
          />
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? "Checking…" : "Import file"}</button>
        {state.status === "error" && <p className="field-error" role="alert">{state.error}</p>}
      </form>

      {confirming && state.status === "confirm" && (
        <div className="rounded-lg bg-warn-bg px-3 py-3 text-sm text-warn-ink" role="alert">
          <p className="font-medium">This file was imported on {state.importedOn}. Import again?</p>
          <p className="mt-1">
            Rows already recorded will be skipped, but anything you discarded or changed since may come back into the
            Queue.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-secondary" disabled={pending || !file} onClick={importAgain}>
              Import again
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDismissed(state)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="card space-y-2 text-sm" role="status">
          <p className="font-medium">{state.fileName}: {state.total} row{state.total === 1 ? "" : "s"} read</p>
          <ul className="space-y-0.5 text-ink-2">
            <li>
              {state.queued} sent to the Queue for review
              {state.queued > 0 && ` — ${state.ready} ready to approve`}
            </li>
            {state.notReady > 0 && (
              <li>
                {state.notReady} can&apos;t be approved yet:{" "}
                {[
                  state.needsInfo > 0 && `${state.needsInfo} need missing details`,
                  state.flagged > 0 && `⚠ ${state.flagged} flagged as possible duplicate${state.flagged === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </li>
            )}
            {state.skippedInFile > 0 && (
              <li>
                {state.skippedInFile} skipped — repeated earlier in this file (same account and reference)
              </li>
            )}
            {state.skippedAlreadyRecorded > 0 && (
              <li>
                {state.skippedAlreadyRecorded} skipped — already recorded (same account and reference)
              </li>
            )}
          </ul>
          {state.queued > 0 && <Link href="/queue" className="btn-primary">Review in Queue</Link>}
        </div>
      )}
    </div>
  );
}
