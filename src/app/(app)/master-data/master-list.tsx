"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addMasterItem, updateMasterItem, type MasterKind, type MasterState } from "./actions";

type Item = { id: string; name: string; archived: boolean; nature?: "active" | "passive" };

export function MasterList({ kind, title, items, hint }: { kind: MasterKind; title: string; items: Item[]; hint?: string }) {
  const [state, action, adding] = useActionState(addMasterItem.bind(null, kind), {} as MasterState);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const update = (id: string, patch: Parameters<typeof updateMasterItem>[2]) =>
    startTransition(async () => {
      try {
        await updateMasterItem(kind, id, patch);
        setError(null);
        setEditing(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });

  const visible = items.filter((i) => showArchived || !i.archived);
  const archivedCount = items.filter((i) => i.archived).length;
  const isIncome = kind === "income_heads";

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-ink-3">{hint}</p>}
      </div>

      <ul className="divide-y divide-border">
        {visible.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-1.5">
            {editing === item.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  update(item.id, { name: String(new FormData(e.currentTarget).get("name")) });
                }}
              >
                <label className="sr-only" htmlFor={`rename-${item.id}`}>Name</label>
                <input id={`rename-${item.id}`} name="name" defaultValue={item.name} autoFocus className="input py-1" maxLength={80} />
                <button className="btn-secondary py-1" disabled={pending}>Save</button>
                <button type="button" className="btn-ghost py-1" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className={`flex-1 text-sm ${item.archived ? "text-ink-3 line-through" : ""}`}>{item.name}</span>
                {isIncome && (
                  <select
                    aria-label={`${item.name} nature`}
                    className="input w-auto py-1 text-xs"
                    value={item.nature}
                    disabled={pending}
                    onChange={(e) => update(item.id, { nature: e.target.value as "active" | "passive" })}
                  >
                    <option value="active">Active</option>
                    <option value="passive">Passive</option>
                  </select>
                )}
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(item.id)}>Rename</button>
                <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => update(item.id, { archived: !item.archived })}>
                  {item.archived ? "Restore" : "Archive"}
                </button>
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="py-1.5 text-sm text-ink-3">None yet.</li>}
      </ul>
      {archivedCount > 0 && (
        <button className="text-xs text-brand" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
        </button>
      )}

      <form ref={formRef} action={action} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`add-${kind}`}>New name</label>
        <input id={`add-${kind}`} name="name" placeholder="Add new…" required maxLength={80} className="input min-w-0 flex-1" />
        {isIncome && (
          <select name="nature" aria-label="Nature" className="input w-auto">
            <option value="active">Active</option>
            <option value="passive">Passive</option>
          </select>
        )}
        <button className="btn-secondary" disabled={adding}>Add</button>
      </form>
      {(state.error || error) && <p className="field-error" role="alert">{state.error ?? error}</p>}
    </section>
  );
}
