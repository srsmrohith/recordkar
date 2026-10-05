import { describe, expect, it } from "vitest";
import { rowOutcome, type QueueRowState } from "./import-outcome";
import type { MasterData } from "./types";

const master: MasterData = {
  accounts: [{ id: "bank", name: "HDFC Bank", type: "bank" }],
  categories: [{ id: "food", name: "Food & Dining" }],
  incomeHeads: [],
  events: [],
};

const queue = (over: Partial<QueueRowState>): QueueRowState => ({
  txn_date: "2026-10-01",
  value_date: null,
  type: "EXPENSE",
  direction: "DEBIT",
  amount: 350,
  account_id: "bank",
  counter_account_id: null,
  category_id: "food",
  income_head_id: null,
  counter_system_head: null,
  merchant: "Zomato",
  description: null,
  event_id: null,
  notes: null,
  reference: "REF105",
  status: "pending",
  issues: {},
  duplicate_of_transaction_id: null,
  duplicate_of_queue_id: null,
  duplicate_reviewed: false,
  posted_transaction_id: null,
  ...over,
});

describe("Import history per-row outcomes", () => {
  it("explains skipped rows by reason", () => {
    expect(rowOutcome("in_file", null, master)).toMatchObject({ kind: "skipped", reason: expect.stringMatching(/earlier in this file/) });
    expect(rowOutcome("already_recorded", null, master).reason).toMatch(/Already recorded/);
    expect(rowOutcome(null, null, master).reason).toMatch(/reason not recorded/);
  });

  it("says what is holding up a row still in the Queue", () => {
    expect(rowOutcome(null, queue({}), master)).toMatchObject({ kind: "in_queue", reason: "Ready to approve", flagged: false });
    expect(rowOutcome(null, queue({ category_id: null }), master).reason).toBe("Category is required");
    expect(
      rowOutcome(null, queue({ account_id: null, issues: { account: 'No account named "HDFC Bnak"' } }), master).reason,
    ).toBe('No account named "HDFC Bnak"');
    const dup = rowOutcome(null, queue({ duplicate_of_transaction_id: "t1" }), master);
    expect(dup).toMatchObject({ flagged: true, reason: "Possible duplicate — choose Keep or Discard" });
  });

  it("reports posted and discarded rows, noting duplicate flags", () => {
    expect(rowOutcome(null, queue({ status: "posted", posted_transaction_id: "t9" }), master)).toMatchObject({ kind: "posted", flagged: false });
    expect(
      rowOutcome(null, queue({ status: "posted", duplicate_of_transaction_id: "t1", duplicate_reviewed: true }), master).reason,
    ).toMatch(/not a duplicate/);
    expect(rowOutcome(null, queue({ status: "discarded", duplicate_of_queue_id: "q1" }), master)).toMatchObject({
      kind: "discarded",
      flagged: true,
      reason: expect.stringMatching(/flagged as a possible duplicate/),
    });
  });
});
