"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importCsv, type ImportState } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(importCsv, { status: "idle" } as ImportState);

  return (
    <div className="space-y-3">
      <form action={action} className="card space-y-3">
        <h2 className="text-sm font-semibold">Upload completed template</h2>
        <div>
          <label htmlFor="file" className="label">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="input file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm" />
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? "Checking…" : "Upload & check"}</button>
        {state.status === "error" && <p className="field-error" role="alert">{state.error}</p>}
      </form>

      {state.status === "done" && (
        <div className="card space-y-2 text-sm" role="status">
          <p className="font-medium">{state.fileName}: {state.total} row{state.total === 1 ? "" : "s"} read</p>
          <ul className="space-y-0.5 text-ink-2">
            <li>{state.queued} sent to the Queue for review</li>
            {state.needsInfo > 0 && <li>{state.needsInfo} need missing details filled in</li>}
            {state.flagged > 0 && <li>⚠ {state.flagged} flagged as possible duplicates</li>}
            {state.skipped > 0 && <li>{state.skipped} skipped — same account and reference already recorded</li>}
          </ul>
          {state.queued > 0 && <Link href="/queue" className="btn-primary">Review in Queue</Link>}
        </div>
      )}
    </div>
  );
}
