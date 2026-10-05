import { describe, expect, it } from "vitest";
import { buildTransactionsCsv, EXPORT_DISCLAIMER, safeCell, type ExportRow } from "./export-csv";
import type { MasterData } from "./engine/types";
import { activeFilterCount, filtersToQuery, parseTxnFilters, sanitizeSearch } from "./txn-filters";

const today = "2026-10-05";
const A = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";

describe("Transactions filters", () => {
  it("defaults to the current month and keeps month navigation", () => {
    expect(parseTxnFilters({}, today).dates).toEqual({ mode: "month", month: "2026-10-01" });
    expect(parseTxnFilters({ month: "2026-09" }, today).dates).toEqual({ mode: "month", month: "2026-09-01" });
    expect(parseTxnFilters({ month: "2026-13" }, today).dates).toEqual({ mode: "month", month: "2026-10-01" });
  });

  it("supports a date range (open-ended or swapped) and all dates", () => {
    expect(parseTxnFilters({ from: "2026-09-15", to: "2026-10-02" }, today).dates).toEqual({ mode: "range", from: "2026-09-15", to: "2026-10-02" });
    expect(parseTxnFilters({ from: "2026-10-02", to: "2026-09-15" }, today).dates).toEqual({ mode: "range", from: "2026-09-15", to: "2026-10-02" });
    expect(parseTxnFilters({ to: "2026-10-02", month: "2026-09" }, today).dates).toEqual({ mode: "range", from: null, to: "2026-10-02" });
    expect(parseTxnFilters({ all: "1", from: "2026-01-01" }, today).dates).toEqual({ mode: "all" });
  });

  it("parses account, category / income head, event, search and amount", () => {
    const f = parseTxnFilters({ account: A, category: `income_head:${C}`, event: C, q: " swiggy ", min: "500", max: "₹1,000" }, today);
    expect(f).toMatchObject({ account: A, counter: { kind: "income_head", id: C }, event: C, q: "swiggy", min: 500, max: 1000 });
    expect(activeFilterCount(f)).toBe(6);
    expect(parseTxnFilters({ min: "900", max: "100" }, today)).toMatchObject({ min: 100, max: 900 });
  });

  it("ignores malformed ids and unsafe search characters", () => {
    const f = parseTxnFilters({ account: "x,or(1=1)", category: "category:nope", event: "1" }, today);
    expect(f).toMatchObject({ account: null, counter: null, event: null });
    expect(sanitizeSearch("a,b) or (c.eq.%1*")).toBe("a b or c.eq. 1");
    expect(sanitizeSearch("   ")).toBeNull();
  });

  it("round-trips through the URL (used for month links and Export CSV)", () => {
    const f = parseTxnFilters({ from: "2026-09-01", to: "2026-09-30", account: A, q: "uber", max: "300" }, today);
    expect(parseTxnFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f))), today)).toEqual(f);
    expect(filtersToQuery(f, { dates: { mode: "month", month: "2026-08-01" } })).toContain("month=2026-08");
  });
});

describe("Export CSV", () => {
  const master: MasterData = {
    accounts: [{ id: "bank", name: "HDFC Bank", type: "bank" }],
    categories: [{ id: "food", name: "Food & Dining" }],
    incomeHeads: [],
    events: [{ id: "ev", name: "Diwali" }],
  };
  const row: ExportRow = {
    id: "t1",
    txn_date: "2026-10-02",
    value_date: null,
    type: "EXPENSE",
    direction: "DEBIT",
    amount: "480.00",
    account_id: "bank",
    counter_account_id: null,
    category_id: "food",
    income_head_id: null,
    counter_system_head: null,
    merchant: "Swiggy",
    description: "Dinner, with friends",
    event_id: "ev",
    notes: "=HYPERLINK(\"http://x\")",
    source: "csv",
  };

  it("starts with the personal-use disclaimer and the column headers", () => {
    const lines = buildTransactionsCsv([row], master, new Map([["t1", ["REF002"]]])).split("\r\n");
    // One quoted cell (it contains commas), so it stays a single line in a spreadsheet.
    expect(lines[0]).toBe(`"${EXPORT_DISCLAIMER}"`);
    expect(lines[1]).toBe(
      "Date,Value Date,Type,Account,Category / Other side,Money in/out,Amount,Signed amount,Merchant,Description,Event,Reference,Notes,Source",
    );
    expect(lines[2]).toBe(
      `2026-10-02,,Expense,HDFC Bank,Food & Dining,Out,480.00,-480.00,Swiggy,"Dinner, with friends",Diwali,REF002,"'=HYPERLINK(""http://x"")",Imported`,
    );
  });

  it("neutralises spreadsheet formulas in text but not in numbers", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("+91 98")).toBe("'+91 98");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("Swiggy")).toBe("Swiggy");
    expect(safeCell(null)).toBe("");
  });
});
