import { describe, expect, it } from "vitest";
import { accountNote, blockedMessage, changeOpeningHref, importNote, LIST_LABEL, queueNote, safeReturnTo, summaryNote } from "./opening-notes";

const hdfc = { accountId: "a1", accountName: "HDFC Bank", openingDate: "2026-10-04" };

describe("opening balance date wording", () => {
  it("names the account when a manual entry is blocked", () => {
    expect(blockedMessage(hdfc)).toBe(
      "HDFC Bank's records start on 04 Oct 2026 (its opening balance date). Transactions before then can't be added — use a later date, or change HDFC Bank's opening balance.",
    );
  });

  it("uses the agreed Queue card note", () => {
    expect(queueNote(hdfc)).toBe(
      "Dated before HDFC Bank's opening balance date (04 Oct 2026). It won't be counted. To count it, update the opening balance date and amount.",
    );
  });

  it("uses the agreed import note, singular and plural", () => {
    expect(importNote({ ...hdfc, count: 3 })).toBe(
      "3 transactions are dated before HDFC Bank's opening balance date (04 Oct 2026) and won't be counted. To count them, update the opening balance date and amount.",
    );
    expect(importNote({ ...hdfc, count: 1 })).toMatch(/^1 transaction is dated .* To count it,/);
  });

  it("has the Accounts, Dashboard and list wording", () => {
    expect(accountNote(3, "2026-10-04")).toMatch(/^3 transactions are dated before the opening balance date \(04 Oct 2026\) and aren't counted/);
    expect(summaryNote(3)).toBe("3 transactions before opening balance dates aren't counted.");
    expect(summaryNote(1)).toBe("1 transaction before opening balance dates isn't counted.");
    expect(LIST_LABEL).toBe("Before opening balance date, not counted");
  });
});

describe("Change opening balance link", () => {
  it("pre-fills the date and returns to where you were", () => {
    expect(changeOpeningHref("a1", "2026-10-02", "/transactions/new")).toBe(
      "/accounts/a1/opening-balance?date=2026-10-02&returnTo=%2Ftransactions%2Fnew",
    );
  });

  it("only returns to same-site paths", () => {
    expect(safeReturnTo("/queue")).toBe("/queue");
    expect(safeReturnTo("https://evil.example")).toBe("/accounts");
    expect(safeReturnTo("//evil.example")).toBe("/accounts");
    expect(safeReturnTo("/\\evil.example")).toBe("/accounts");
    expect(safeReturnTo(null)).toBe("/accounts");
  });
});
