import { describe, expect, it } from "vitest";
import {
  accountBalance,
  blockingAccount,
  groupBeforeOpening,
  isCounted,
  openingConflict,
  previewOpeningChange,
  startsFromMaster,
  type BalanceTxn,
} from "./counting";
import { validateDraft } from "./treatment";
import { emptyDraft, type MasterData, type TxnDraft } from "./types";

// The user's real data: HDFC Bank opening balance ₹50,000 dated 04 Oct; imported rows on 01–03 Oct.
const hdfc: BalanceTxn[] = [
  { id: "open", type: "OPENING_BALANCE", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null, direction: "CREDIT", amount: 50000 },
  { id: "salary", type: "INCOME", txn_date: "2026-10-01", account_id: "hdfc", counter_account_id: null, direction: "CREDIT", amount: 85000 },
  { id: "swiggy1", type: "EXPENSE", txn_date: "2026-10-02", account_id: "hdfc", counter_account_id: null, direction: "DEBIT", amount: 480 },
  { id: "swiggy2", type: "EXPENSE", txn_date: "2026-10-03", account_id: "hdfc", counter_account_id: null, direction: "DEBIT", amount: 520 },
  { id: "dividend", type: "INCOME", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null, direction: "CREDIT", amount: 100 },
  { id: "uber", type: "EXPENSE", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null, direction: "DEBIT", amount: 300 },
  { id: "shop", type: "EXPENSE", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null, direction: "DEBIT", amount: 200 },
  { id: "charge", type: "EXPENSE", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null, direction: "DEBIT", amount: 2000 },
  { id: "a", type: "EXPENSE", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null, direction: "DEBIT", amount: 310 },
];

const master: MasterData = {
  accounts: [
    { id: "hdfc", name: "HDFC Bank", type: "bank", openingDate: "2026-10-04" },
    { id: "card", name: "ICICI Card", type: "credit_card", openingDate: "2026-10-02" },
    { id: "cash", name: "Cash", type: "cash", openingDate: null },
  ],
  categories: [{ id: "food", name: "Food & Dining" }],
  incomeHeads: [],
  events: [],
};
const starts = startsFromMaster(master);

const draft = (over: Partial<TxnDraft>): TxnDraft => ({
  ...emptyDraft(),
  type: "EXPENSE",
  direction: "DEBIT",
  amount: 100,
  accountId: "hdfc",
  counter: { kind: "category", id: "food" },
  ...over,
});

describe("a transaction counts from each account's opening balance date", () => {
  it("counts on or after the opening date, not before", () => {
    expect(isCounted({ txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: null }, starts)).toBe(true);
    expect(isCounted({ txn_date: "2026-10-03", account_id: "hdfc", counter_account_id: null }, starts)).toBe(false);
  });

  it("accounts without an opening balance have no start", () => {
    expect(isCounted({ txn_date: "2020-01-01", account_id: "cash", counter_account_id: null }, starts)).toBe(true);
  });

  it("needs both legs of a transfer to be on or after their accounts' opening dates", () => {
    // Card starts 02 Oct, HDFC 04 Oct: a 03 Oct card payment from HDFC is blocked by HDFC.
    expect(blockingAccount({ txn_date: "2026-10-03", account_id: "hdfc", counter_account_id: "card" }, starts)).toBe("hdfc");
    expect(blockingAccount({ txn_date: "2026-10-03", account_id: "cash", counter_account_id: "card" }, starts)).toBeNull();
    expect(blockingAccount({ txn_date: "2026-10-01", account_id: "cash", counter_account_id: "card" }, starts)).toBe("card");
  });
});

describe("balances exclude uncounted transactions (the user's HDFC data)", () => {
  it("is ₹47,290 with the opening date at 04 Oct", () => {
    expect(accountBalance(hdfc, "hdfc", "bank", starts)).toBe(47290);
  });

  it("is ₹1,31,290 with the opening date moved to 01 Oct", () => {
    expect(accountBalance(hdfc, "hdfc", "bank", new Map([["hdfc", "2026-10-01"]]))).toBe(131290);
  });

  it("treats card charges as outstanding", () => {
    const txns: BalanceTxn[] = [
      { id: "o", type: "OPENING_BALANCE", txn_date: "2026-10-02", account_id: "card", counter_account_id: null, direction: "DEBIT", amount: 1000 },
      { id: "c", txn_date: "2026-10-03", account_id: "card", counter_account_id: null, direction: "DEBIT", amount: 250 },
      { id: "p", txn_date: "2026-10-04", account_id: "hdfc", counter_account_id: "card", direction: "DEBIT", amount: 600 },
    ];
    expect(accountBalance(txns, "card", "credit_card", starts)).toBe(650);
  });
});

describe("previewing an opening date change", () => {
  it("moving earlier: shows the new balance and what starts counting", () => {
    const p = previewOpeningChange({ txns: hdfc, accountId: "hdfc", accountType: "bank", starts, newDate: "2026-10-01", newAmount: 50000 });
    expect(p.currentBalance).toBe(47290);
    expect(p.newBalance).toBe(131290);
    expect(p.startCounting.map((t) => t.id)).toEqual(["salary", "swiggy1", "swiggy2"]);
    expect(p.stopCounting).toEqual([]);
  });

  it("uses the re-confirmed amount for the new start", () => {
    const p = previewOpeningChange({ txns: hdfc, accountId: "hdfc", accountType: "bank", starts, newDate: "2026-10-01", newAmount: 10000 });
    expect(p.newBalance).toBe(91290);
  });

  it("moving later: lists what stops counting", () => {
    const p = previewOpeningChange({ txns: hdfc, accountId: "hdfc", accountType: "bank", starts: new Map([["hdfc", "2026-10-01"]]), newDate: "2026-10-04", newAmount: 50000 });
    expect(p.stopCounting.map((t) => t.id)).toEqual(["salary", "swiggy1", "swiggy2"]);
    expect(p.newBalance).toBe(47290);
  });

  it("works for an account that has no opening balance yet", () => {
    const txns = hdfc.filter((t) => t.id !== "open");
    const p = previewOpeningChange({ txns, accountId: "hdfc", accountType: "bank", starts: new Map(), newDate: "2026-10-04", newAmount: 50000 });
    expect(p.stopCounting.map((t) => t.id)).toEqual(["salary", "swiggy1", "swiggy2"]);
    expect(p.newBalance).toBe(47290);
  });
});

describe("drafts dated before an opening balance date", () => {
  it("names the account that blocks a manual entry, including the other leg of a transfer", () => {
    expect(openingConflict(draft({ txnDate: "2026-10-03" }), master)).toEqual({ accountId: "hdfc", accountName: "HDFC Bank", openingDate: "2026-10-04" });
    expect(openingConflict(draft({ txnDate: "2026-10-04" }), master)).toBeNull();
    const transfer = draft({ type: "TRANSFER", accountId: "cash", counter: { kind: "account", id: "card" }, txnDate: "2026-10-01" });
    expect(openingConflict(transfer, master)?.accountName).toBe("ICICI Card");
  });

  it("never blocks the opening balance itself", () => {
    expect(openingConflict(draft({ type: "OPENING_BALANCE", txnDate: "2026-09-01", counter: null }), master)).toBeNull();
  });

  it("groups imported rows per account for the import note", () => {
    const groups = groupBeforeOpening(
      [draft({ txnDate: "2026-10-01" }), draft({ txnDate: "2026-10-02" }), draft({ txnDate: "2026-10-05" }), draft({ accountId: "card", txnDate: "2026-10-01" })],
      master,
    );
    expect(groups).toEqual([
      { accountId: "hdfc", accountName: "HDFC Bank", openingDate: "2026-10-04", count: 2 },
      { accountId: "card", accountName: "ICICI Card", openingDate: "2026-10-02", count: 1 },
    ]);
  });
});

describe("future dates", () => {
  it("are rejected", () => {
    expect(validateDraft(draft({ txnDate: "2026-10-06" }), master, { today: "2026-10-05" }).txnDate).toBe("Date can't be in the future");
    expect(validateDraft(draft({ txnDate: "2026-10-05" }), master, { today: "2026-10-05" }).txnDate).toBeUndefined();
  });
});
