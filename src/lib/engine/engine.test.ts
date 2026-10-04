import { describe, expect, it } from "vitest";
import { parseAmount, parseDate, parseTemplateCsv, resolveRow, templateCsv } from "./csv";
import { findFuzzyDuplicate, textSimilarity } from "./duplicates";
import {
  buildComponents,
  describeTreatment,
  draftFromRow,
  isBalanced,
  toTxnPayload,
  validateDraft,
} from "./treatment";
import { emptyDraft, type MasterData, type TxnDraft } from "./types";

const master: MasterData = {
  accounts: [
    { id: "bank", name: "HDFC Savings", type: "bank" },
    { id: "card", name: "ICICI Card", type: "credit_card" },
    { id: "cash", name: "Cash", type: "cash" },
  ],
  categories: [{ id: "food", name: "Food & Dining" }],
  incomeHeads: [{ id: "salary", name: "Salary", nature: "active" }],
  events: [{ id: "diwali", name: "Diwali" }],
};

const draft = (over: Partial<TxnDraft>): TxnDraft => ({
  ...emptyDraft(),
  txnDate: "2026-10-01",
  amount: 480,
  accountId: "bank",
  ...over,
});

describe("treatment", () => {
  it("expense from bank: Dr category, Cr bank", () => {
    const d = draft({ type: "EXPENSE", counter: { kind: "category", id: "food" } });
    expect(validateDraft(d, master)).toEqual({});
    expect(buildComponents(d)).toEqual([
      { side: "CR", amount: 480, account_id: "bank" },
      { side: "DR", amount: 480, category_id: "food" },
    ]);
  });

  it("expense on credit card: Dr category, Cr card (liability goes up)", () => {
    const d = draft({ type: "EXPENSE", accountId: "card", counter: { kind: "category", id: "food" } });
    expect(buildComponents(d)[0]).toEqual({ side: "CR", amount: 480, account_id: "card" });
    expect(describeTreatment(d, master)?.summary).toContain("outstanding goes up");
  });

  it("income: Dr bank, Cr income head", () => {
    const d = draft({ type: "INCOME", amount: 90000, counter: { kind: "income_head", id: "salary" } });
    expect(buildComponents(d)).toEqual([
      { side: "DR", amount: 90000, account_id: "bank" },
      { side: "CR", amount: 90000, income_head_id: "salary" },
    ]);
  });

  it("card bill payment is a transfer: Dr card, Cr bank", () => {
    const d = draft({ type: "TRANSFER", direction: "DEBIT", counter: { kind: "account", id: "card" } });
    expect(buildComponents(d)).toEqual([
      { side: "CR", amount: 480, account_id: "bank" },
      { side: "DR", amount: 480, account_id: "card" },
    ]);
  });

  it("refund: Dr account, Cr expense category", () => {
    const d = draft({ type: "REFUND", counter: { kind: "category", id: "food" } });
    expect(buildComponents(d)).toEqual([
      { side: "DR", amount: 480, account_id: "bank" },
      { side: "CR", amount: 480, category_id: "food" },
    ]);
  });

  it("adjustment posts against Balance Adjustment, not income/expense", () => {
    const d = draft({ type: "ADJUSTMENT", direction: "CREDIT" });
    expect(validateDraft(d, master)).toEqual({});
    expect(buildComponents(d)[1]).toEqual({ side: "CR", amount: 480, system_head: "balance_adjustment" });
  });

  it("opening outstanding on a card: Dr Opening Balance, Cr card", () => {
    const d = draft({ type: "OPENING_BALANCE", accountId: "card", direction: "DEBIT" });
    expect(buildComponents(d)).toEqual([
      { side: "CR", amount: 480, account_id: "card" },
      { side: "DR", amount: 480, system_head: "opening_balance" },
    ]);
  });

  it("every complete draft balances (Dr = Cr)", () => {
    for (const d of [
      draft({ type: "EXPENSE", counter: { kind: "category", id: "food" }, amount: 0.1 + 0.2 }),
      draft({ type: "OTHER", direction: "CREDIT", counter: { kind: "income_head", id: "salary" } }),
    ]) {
      expect(isBalanced(buildComponents(d))).toBe(true);
    }
  });

  it("rounds amounts to paise", () => {
    expect(buildComponents(draft({ type: "EXPENSE", amount: 10.005, counter: { kind: "category", id: "food" } }))[0].amount).toBe(10.01);
  });
});

describe("validation asks instead of guessing", () => {
  it("reports every missing required input", () => {
    expect(Object.keys(validateDraft(emptyDraft(), master)).sort()).toEqual(["account", "amount", "txnDate", "type"]);
    expect(Object.keys(validateDraft(draft({ type: "EXPENSE" }), master))).toEqual(["counter"]);
    expect(Object.keys(validateDraft(draft({ type: "TRANSFER" }), master)).sort()).toEqual(["counter", "direction"]);
  });

  it("flags an expense marked CREDIT instead of silently flipping it", () => {
    const issues = validateDraft(draft({ type: "EXPENSE", direction: "CREDIT", counter: { kind: "category", id: "food" } }), master);
    expect(issues.direction).toMatch(/Refund/);
  });

  it("rejects a transfer to the same account", () => {
    const issues = validateDraft(draft({ type: "TRANSFER", direction: "DEBIT", counter: { kind: "account", id: "bank" } }), master);
    expect(issues.counter).toBeDefined();
  });

  it("rejects a counter of the wrong kind for the type", () => {
    const issues = validateDraft(draft({ type: "INCOME", counter: { kind: "category", id: "food" } }), master);
    expect(issues.counter).toBeDefined();
  });

  it("no treatment is proposed until the draft is complete", () => {
    expect(describeTreatment(draft({ type: "EXPENSE" }), master)).toBeNull();
  });
});

describe("payload round-trip", () => {
  it("draftFromRow(toTxnPayload(d)) preserves the draft", () => {
    const d = draft({ type: "EXPENSE", counter: { kind: "category", id: "food" }, merchant: "Swiggy", eventId: "diwali" });
    const p = toTxnPayload(d, "manual");
    expect(p.category_id).toBe("food");
    expect(p.counter_account_id).toBeNull();
    expect(draftFromRow({ ...p, direction: p.direction })).toEqual({ ...d, direction: "DEBIT" });
  });
});

describe("csv", () => {
  it("parses dates in Indian statement formats", () => {
    expect(parseDate("2026-10-04")).toBe("2026-10-04");
    expect(parseDate("04/10/2026")).toBe("2026-10-04");
    expect(parseDate("4-Oct-2026")).toBe("2026-10-04");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("10/04/26")).toBeNull();
  });

  it("parses rupee amounts", () => {
    expect(parseAmount("₹1,23,456.50")).toBe(123456.5);
    expect(parseAmount("Rs. 480")).toBe(480);
    expect(parseAmount("abc")).toBeNull();
  });

  it("requires template columns", () => {
    const r = parseTemplateCsv("Date,Amount\n2026-10-01,5");
    expect(r.ok).toBe(false);
  });

  it("parses the downloadable template and resolves names case-insensitively", () => {
    const r = parseTemplateCsv(templateCsv());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const { draft: d, issues } = resolveRow(r.rows[0].raw, master);
    expect(issues).toEqual({});
    expect(d.accountId).toBe("bank");
    expect(d.counter).toEqual({ kind: "category", id: "food" });
    expect(validateDraft(d, master)).toEqual({});
  });

  it("keeps unresolvable values as questions, and Person/Group as text", () => {
    const { draft: d, issues, personText } = resolveRow(
      { "Transaction Date": "2026-10-01", Account: "HDFC Savngs", "Transaction Type": "TRANSFER", Amount: "100", "Debit/Credit": "DEBIT", Person: "Dilip" },
      master,
    );
    expect(d.accountId).toBeNull();
    expect(issues.account).toContain("HDFC Savngs");
    expect(d.counter).toBeNull(); // transfer's other account is asked on the Queue card
    expect(personText).toBe("Dilip");
  });
});

describe("duplicates", () => {
  const existing = {
    id: "t1",
    kind: "transaction" as const,
    account_id: "bank",
    amount: "480.00",
    txn_date: "2026-10-01",
    merchant: "Swiggy",
    description: null,
  };

  it("matches across sources with date tolerance and text similarity", () => {
    expect(findFuzzyDuplicate(draft({ txnDate: "2026-10-03", description: "UPI/SWIGGY/428193" }), [existing])?.id).toBe("t1");
  });

  it("does not match outside the window, a different amount, or different text", () => {
    expect(findFuzzyDuplicate(draft({ txnDate: "2026-10-04", merchant: "Swiggy" }), [existing])).toBeNull();
    expect(findFuzzyDuplicate(draft({ amount: 481, merchant: "Swiggy" }), [existing])).toBeNull();
    expect(findFuzzyDuplicate(draft({ merchant: "Zomato" }), [existing])).toBeNull();
  });

  it("asks when either side has no text", () => {
    expect(findFuzzyDuplicate(draft({}), [existing])?.id).toBe("t1");
  });

  it("ignores payment-rail noise in similarity", () => {
    expect(textSimilarity("UPI/Zomato", "UPI/Swiggy")).toBe(0);
  });
});
