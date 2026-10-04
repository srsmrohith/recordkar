import { describe, expect, it } from "vitest";
import { duplicateFlagUpdate, findReferenceMatch, type ReferenceCandidate } from "./duplicates";
import { fileFingerprint, findPreviousImport, planImport, referenceKeys } from "./import-plan";
import { emptyDraft, type MasterData, type TxnDraft } from "./types";

const master: MasterData = {
  accounts: [{ id: "bank", name: "HDFC Bank", type: "bank" }],
  categories: [{ id: "transport", name: "Transport" }],
  incomeHeads: [],
  events: [],
};

const draft = (over: Partial<TxnDraft>): TxnDraft => ({
  ...emptyDraft(),
  txnDate: "2026-10-04",
  type: "EXPENSE",
  direction: "DEBIT",
  amount: 300,
  accountId: "bank",
  counter: { kind: "category", id: "transport" },
  merchant: "Uber",
  ...over,
});

const ctx = (recorded: string[] = []) => ({ recordedKeys: new Set(recorded), candidates: [], master });

describe("problem 1: duplicates with an unrecognised account", () => {
  it("keys a row by resolved account and by the account text from the file", () => {
    expect(referenceKeys("bank", "HDFC Bank", " REF004 ")).toEqual(["acct:bank|ref004", "raw:hdfc bank|ref004"]);
    expect(referenceKeys(null, "HDFC  Bnk", "REF004")).toEqual(["raw:hdfc bnk|ref004"]);
    expect(referenceKeys("bank", "HDFC Bank", "")).toEqual([]);
  });

  it("skips a re-uploaded row whose account isn't recognised (the REF004 case)", () => {
    const row = { draft: draft({ accountId: null, reference: "REF004" }), issues: { account: 'No account named "HDFC Bnk"' }, rawAccount: "HDFC Bnk" };
    // First upload: nothing recorded yet → queued.
    expect(planImport([row], ctx()).summary.queued).toBe(1);
    // Second upload: the earlier copy (pending or posted) recorded "hdfc bnk|ref004" → skipped.
    const second = planImport([row], ctx(["raw:hdfc bnk|ref004"]));
    expect(second.summary).toMatchObject({ queued: 0, skipped: 1 });
  });

  it("still skips a resolved row whose reference is already posted on that account", () => {
    const row = { draft: draft({ reference: "REF004" }), issues: {}, rawAccount: "HDFC Bank" };
    expect(planImport([row], ctx(["acct:bank|ref004"])).plans[0].skip).toBeTruthy();
  });

  it("skips a repeat of an unrecognised-account row within the same file", () => {
    const row = { draft: draft({ accountId: null, reference: "REF9" }), issues: {}, rawAccount: "HDFC Bnk" };
    expect(planImport([row, row], ctx()).summary).toMatchObject({ queued: 1, skipped: 1 });
  });

  it("re-checks a Queue card by account + reference once its account is fixed", () => {
    const refs: ReferenceCandidate[] = [
      { id: "t1", kind: "transaction", account_id: "bank", reference: "REF004", amount: null, txn_date: null, merchant: null, description: null },
    ];
    expect(findReferenceMatch({ accountId: null, reference: "REF004" }, refs)).toBeNull();
    expect(findReferenceMatch({ accountId: "bank", reference: "ref004" }, refs)?.id).toBe("t1");
  });

  it("raises a new duplicate flag, but keeps a 'Keep' answer when the match is unchanged", () => {
    const clean = { duplicate_of_transaction_id: null, duplicate_of_queue_id: null, duplicate_reviewed: false };
    const raised = duplicateFlagUpdate(clean, { id: "t1", kind: "transaction" });
    expect(raised).toEqual({ changed: true, fields: { duplicate_of_transaction_id: "t1", duplicate_of_queue_id: null, duplicate_reviewed: false } });

    const kept = { duplicate_of_transaction_id: "t1", duplicate_of_queue_id: null, duplicate_reviewed: true };
    expect(duplicateFlagUpdate(kept, { id: "t1", kind: "transaction" }).changed).toBe(false);
    expect(duplicateFlagUpdate(kept, { id: "q9", kind: "queue" }).fields.duplicate_reviewed).toBe(false);
    expect(duplicateFlagUpdate(kept, null).fields.duplicate_of_transaction_id).toBeNull();
  });

  it("recognises the same file uploaded again by name or by identical rows", () => {
    const rows = [{ Account: "HDFC Bnk", Reference: "REF004", Amount: "300" }, { Account: "HDFC Bank", Reference: "REF001" }];
    const fp = fileFingerprint(rows);
    expect(fileFingerprint([...rows].reverse())).toBe(fp);
    const prev = [{ fileName: "Recordkar-Test-Import.csv", createdAt: "2026-10-04T10:00:00Z", fingerprint: null }];
    expect(findPreviousImport("recordkar-test-import.csv", "x", prev)).toBe(prev[0]);
    const renamed = [{ fileName: "october.csv", createdAt: "2026-10-04T10:00:00Z", fingerprint: fp }];
    expect(findPreviousImport("copy of october.csv", fp, renamed)).toBe(renamed[0]);
    expect(findPreviousImport("new.csv", "other", renamed)).toBeNull();
  });
});
