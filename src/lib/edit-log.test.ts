import { describe, expect, it } from "vitest";
import { changedRows, describeEntry, type AuditEntry, type TxnSnapshot } from "./edit-log";
import { formatDateTime } from "./format";
import type { MasterData } from "./engine/types";

const master: MasterData = {
  accounts: [
    { id: "bank", name: "HDFC Savings", type: "bank" },
    { id: "card", name: "ICICI Card", type: "credit_card" },
  ],
  categories: [
    { id: "food", name: "Food & Dining" },
    { id: "travel", name: "Travel" },
  ],
  incomeHeads: [],
  events: [{ id: "diwali", name: "Diwali" }],
};

/** Shaped like txn_snapshot(): transactions row + components + references. */
const snap = (over: Partial<TxnSnapshot> = {}): TxnSnapshot => ({
  id: "t1",
  user_id: "u1",
  txn_date: "2026-10-01",
  value_date: null,
  type: "EXPENSE",
  direction: "DEBIT",
  amount: 480,
  account_id: "bank",
  counter_account_id: null,
  category_id: "food",
  income_head_id: null,
  counter_system_head: null,
  merchant: "Swiggy",
  description: null,
  event_id: null,
  notes: null,
  source: "manual",
  created_at: "2026-10-01T10:00:00+00:00",
  updated_at: "2026-10-01T10:00:00+00:00",
  components: [
    { side: "CR", amount: 480, account_id: "bank" },
    { side: "DR", amount: 480, category_id: "food" },
  ],
  references: [],
  ...over,
});

const entry = (action: AuditEntry["action"], before: TxnSnapshot | null, after: TxnSnapshot | null): AuditEntry => ({
  id: 1,
  entity_id: "t1",
  action,
  before,
  after,
  changed_at: "2026-10-04T11:05:00+00:00",
});

describe("edit log", () => {
  it("shows one friendly row per changed field, ignoring technical fields", () => {
    const after = snap({
      amount: 520,
      updated_at: "2026-10-04T11:05:00+00:00",
      created_at: "2026-10-02T00:00:00+00:00",
      components: [
        { side: "CR", amount: 520, account_id: "bank" },
        { side: "DR", amount: 520, category_id: "food" },
      ],
    });
    expect(changedRows(snap(), after, master)).toEqual([{ label: "Amount", from: "₹480.00", to: "₹520.00" }]);
  });

  it("treats numeric strings and numbers as the same amount, and empty as null", () => {
    expect(changedRows(snap({ amount: "480.00", notes: "" }), snap({ amount: 480, notes: null }), master)).toEqual([]);
  });

  it("summarises debit/credit line changes as one Accounting entry row", () => {
    const after = snap({
      category_id: "travel",
      account_id: "card",
      components: [
        { side: "CR", amount: 480, account_id: "card" },
        { side: "DR", amount: 480, category_id: "travel" },
      ],
    });
    expect(changedRows(snap(), after, master)).toEqual([
      { label: "Account", from: "HDFC Savings", to: "ICICI Card" },
      { label: "Category", from: "Food & Dining", to: "Travel" },
      { label: "Accounting entry", from: "Dr Food & Dining · Cr HDFC Savings", to: "Dr Travel · Cr ICICI Card" },
    ]);
  });

  it("names events, references and dates", () => {
    const rows = changedRows(snap(), snap({ event_id: "diwali", references: ["UPI-1"], txn_date: "2026-10-02" }), master);
    expect(rows).toEqual([
      { label: "Date", from: "01 Oct 2026", to: "02 Oct 2026" },
      { label: "Event", from: "—", to: "Diwali" },
      { label: "Reference", from: "—", to: "UPI-1" },
    ]);
  });

  it("shows key fields for posted entries", () => {
    const item = describeEntry(entry("create", null, snap()), master);
    expect(item.title).toBe("Swiggy");
    expect(item.rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Date: 01 Oct 2026",
      "Type: Expense",
      "Account: HDFC Savings",
      "Category: Food & Dining",
      "Amount: ₹480.00",
      "Merchant: Swiggy",
    ]);
  });

  it("shows what was removed for deleted entries", () => {
    const item = describeEntry(entry("delete", snap(), null), master);
    expect(item.rows.map((r) => r.label)).toEqual(["Date", "Account", "Amount", "Category", "Merchant"]);
  });

  it("says so when an edit changed nothing visible", () => {
    const item = describeEntry(entry("update", snap(), snap({ updated_at: "2026-10-05T00:00:00+00:00" })), master);
    expect(item.rows).toEqual([{ label: "No visible changes", value: "Saved without changing any details" }]);
  });

  it("formats times in India time", () => {
    // 18:45 UTC on 4 Oct is 00:15 IST on 5 Oct.
    expect(formatDateTime("2026-10-04T18:45:00Z")).toMatch(/05 Oct 2026.*12:15\s*am/i);
  });
});
