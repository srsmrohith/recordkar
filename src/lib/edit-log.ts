// Edit log: turns the before/after snapshots stored in the audit_history table into
// user-facing rows like "Amount: ₹480 → ₹520". Works on existing entries; no schema change.
import { headName } from "@/lib/engine/treatment";
import type { Component, MasterData, SystemHead, TxnType } from "@/lib/engine/types";
import { formatDate, inr, TXN_TYPE_LABELS } from "@/lib/format";

/** Shape written by txn_snapshot(): the transactions row + its components and references. */
export type TxnSnapshot = Record<string, unknown> & {
  components?: Component[];
  references?: string[];
};

export type AuditEntry = {
  id: number;
  entity_id: string;
  action: "create" | "update" | "delete";
  before: TxnSnapshot | null;
  after: TxnSnapshot | null;
  changed_at: string;
};

/** A changed field ("from → to") or, for created/deleted entries, a key field ("value"). */
export type EditLogRow = { label: string; from?: string; to?: string; value?: string };

export type EditLogItem = {
  title: string;
  rows: EditLogRow[];
};

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function counterOf(s: TxnSnapshot): Component | null {
  if (s.counter_account_id) return { side: "DR", amount: 0, account_id: String(s.counter_account_id) };
  if (s.category_id) return { side: "DR", amount: 0, category_id: String(s.category_id) };
  if (s.income_head_id) return { side: "DR", amount: 0, income_head_id: String(s.income_head_id) };
  if (s.counter_system_head) return { side: "DR", amount: 0, system_head: s.counter_system_head as SystemHead };
  return null;
}

function counterLabelFor(type: unknown): string {
  switch (type) {
    case "EXPENSE":
    case "REFUND":
      return "Category";
    case "INCOME":
      return "Income head";
    case "TRANSFER":
      return "Other account";
    case "OPENING_BALANCE":
    case "ADJUSTMENT":
      return "Recorded as";
    default:
      return "Linked to";
  }
}

/** Plain names for system heads — no accounting jargon outside the treatment preview. */
const SYSTEM_HEAD_PLAIN: Record<SystemHead, string> = {
  opening_balance: "Starting balance",
  balance_adjustment: "Balance correction",
};

type Field = {
  label: string | ((s: TxnSnapshot) => string);
  /** Comparable value; null when empty. */
  key: (s: TxnSnapshot) => string | number | null;
  show: (s: TxnSnapshot, m: MasterData) => string;
};

const nameOf = (list: { id: string; name: string }[], id: unknown) =>
  id ? (list.find((x) => x.id === id)?.name ?? "(removed)") : "—";

/** User-facing transaction fields, in display order. Technical fields (ids, timestamps, source) are not listed. */
const FIELDS: Record<string, Field> = {
  date: { label: "Date", key: (s) => str(s.txn_date), show: (s) => formatDate(str(s.txn_date)) },
  type: { label: "Type", key: (s) => str(s.type), show: (s) => (s.type ? TXN_TYPE_LABELS[s.type as TxnType] ?? String(s.type) : "—") },
  direction: {
    label: "Money in/out",
    key: (s) => str(s.direction),
    show: (s) => (s.direction === "DEBIT" ? "Money out" : s.direction === "CREDIT" ? "Money in" : "—"),
  },
  amount: { label: "Amount", key: (s) => num(s.amount), show: (s) => (num(s.amount) === null ? "—" : inr(num(s.amount))) },
  account: { label: "Account", key: (s) => str(s.account_id), show: (s, m) => nameOf(m.accounts, s.account_id) },
  counter: {
    label: (s) => counterLabelFor(s.type),
    key: (s) => {
      const c = counterOf(s);
      return c ? JSON.stringify(c) : null;
    },
    show: (s, m) => {
      const c = counterOf(s);
      if (!c) return "—";
      return c.system_head ? SYSTEM_HEAD_PLAIN[c.system_head] : headName(c, m);
    },
  },
  merchant: { label: "Merchant", key: (s) => str(s.merchant), show: (s) => str(s.merchant) ?? "—" },
  description: { label: "Description", key: (s) => str(s.description), show: (s) => str(s.description) ?? "—" },
  event: { label: "Event", key: (s) => str(s.event_id), show: (s, m) => nameOf(m.events, s.event_id) },
  valueDate: { label: "Value date", key: (s) => str(s.value_date), show: (s) => formatDate(str(s.value_date)) },
  reference: {
    label: "Reference",
    key: (s) => (s.references?.length ? s.references.join(", ") : null),
    show: (s) => (s.references?.length ? s.references.join(", ") : "—"),
  },
  notes: { label: "Notes", key: (s) => str(s.notes), show: (s) => str(s.notes) ?? "—" },
};

const labelOf = (f: Field, s: TxnSnapshot) => (typeof f.label === "function" ? f.label(s) : f.label);

function title(s: TxnSnapshot | null, m: MasterData): string {
  if (!s) return "Transaction";
  return str(s.merchant) ?? str(s.description) ?? (counterOf(s) ? FIELDS.counter.show(s, m) : FIELDS.type.show(s, m));
}

/**
 * Changed fields between two snapshots, one row per field. The debit/credit lines are derived from
 * these fields (type, account, category, amount, direction), so their change is already described in
 * plain words here — Dr/Cr only appears in the treatment preview, never in the Edit log.
 */
export function changedRows(before: TxnSnapshot, after: TxnSnapshot, m: MasterData): EditLogRow[] {
  const rows: EditLogRow[] = [];
  for (const f of Object.values(FIELDS)) {
    if (f.key(before) === f.key(after)) continue;
    rows.push({ label: labelOf(f, after), from: f.show(before, m), to: f.show(after, m) });
  }
  return rows;
}

function keyRows(s: TxnSnapshot, m: MasterData, fields: (keyof typeof FIELDS)[]): EditLogRow[] {
  return fields
    .map((k) => FIELDS[k])
    .filter((f) => f.key(s) !== null)
    .map((f) => ({ label: labelOf(f, s), value: f.show(s, m) }));
}

/** User-facing description of one Edit log entry for a transaction. */
export function describeEntry(entry: AuditEntry, m: MasterData): EditLogItem {
  switch (entry.action) {
    case "create":
      return {
        title: title(entry.after, m),
        rows: entry.after ? keyRows(entry.after, m, ["date", "type", "account", "counter", "amount", "merchant"]) : [],
      };
    case "delete":
      return {
        title: title(entry.before, m),
        rows: entry.before ? keyRows(entry.before, m, ["date", "account", "amount", "counter", "merchant"]) : [],
      };
    case "update": {
      const rows = entry.before && entry.after ? changedRows(entry.before, entry.after, m) : [];
      return {
        title: title(entry.after ?? entry.before, m),
        rows: rows.length ? rows : [{ label: "No visible changes", value: "Saved without changing any details" }],
      };
    }
  }
}
