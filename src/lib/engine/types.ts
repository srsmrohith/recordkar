export const TXN_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "REFUND", "ADJUSTMENT", "OTHER"] as const;
export type UserTxnType = (typeof TXN_TYPES)[number];
export type TxnType = UserTxnType | "OPENING_BALANCE";

/** Statement direction: DEBIT = money out of / charged to the account; CREDIT = money in. */
export type Direction = "DEBIT" | "CREDIT";
export type Side = "DR" | "CR";
export type SystemHead = "opening_balance" | "balance_adjustment";
export type AccountType = "bank" | "cash" | "credit_card" | "wallet";
export type IncomeNature = "active" | "passive";

/** The counter side of a transaction: exactly one ledger head. */
export type Counter =
  | { kind: "account"; id: string }
  | { kind: "category"; id: string }
  | { kind: "income_head"; id: string }
  | { kind: "system"; head: SystemHead };

/**
 * A transaction as the user (or an import) describes it. Every field may be missing while
 * the transaction is still a draft — the engine reports what is missing instead of guessing.
 */
export type TxnDraft = {
  txnDate: string | null; // YYYY-MM-DD
  valueDate: string | null;
  type: TxnType | null;
  direction: Direction | null;
  amount: number | null;
  accountId: string | null;
  counter: Counter | null;
  merchant: string | null;
  description: string | null;
  eventId: string | null;
  notes: string | null;
  reference: string | null;
};

export type Component = {
  side: Side;
  amount: number;
  account_id?: string;
  category_id?: string;
  income_head_id?: string;
  system_head?: SystemHead;
};

export type Named = { id: string; name: string; archived?: boolean };
/** openingDate: the account's opening balance date — the start of its records (null if none). */
export type AccountRef = Named & { type: AccountType; openingDate?: string | null };
export type IncomeHeadRef = Named & { nature: IncomeNature };

/** Master data needed to validate and describe a draft. */
export type MasterData = {
  accounts: AccountRef[];
  categories: Named[];
  incomeHeads: IncomeHeadRef[];
  events: Named[];
};

export const emptyDraft = (): TxnDraft => ({
  txnDate: null,
  valueDate: null,
  type: null,
  direction: null,
  amount: null,
  accountId: null,
  counter: null,
  merchant: null,
  description: null,
  eventId: null,
  notes: null,
  reference: null,
});
