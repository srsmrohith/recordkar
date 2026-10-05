// Opening balance date = start of an account's records (the balance before that day's transactions).
// A transaction counts only if its date is on or after the opening balance date of EVERY account it
// touches (both legs of a transfer). Uncounted transactions are excluded whole — account side and
// category/income side — so everything stays balanced. Nothing is stored: moving an opening date
// earlier brings transactions back automatically. The SQL views (account_balances, monthly_summary)
// apply the same rule; this module is the app-side twin used for notes, lists, previews and export.
import type { AccountType, MasterData, TxnDraft, TxnType } from "./types";

/** account id → opening balance date (YYYY-MM-DD). Accounts without one have no start. */
export type Starts = Map<string, string>;

export function startsFromMaster(master: Pick<MasterData, "accounts">): Starts {
  return new Map(master.accounts.filter((a) => a.openingDate).map((a) => [a.id, a.openingDate!]));
}

export type TxnLike = {
  id?: string;
  txn_date: string;
  type?: TxnType | string;
  account_id: string;
  counter_account_id: string | null;
};

/** The first account whose opening date is after this transaction's date, or null if it counts. */
export function blockingAccount(t: TxnLike, starts: Starts): string | null {
  for (const id of [t.account_id, t.counter_account_id]) {
    if (!id) continue;
    const start = starts.get(id);
    if (start && t.txn_date < start) return id;
  }
  return null;
}

export const isCounted = (t: TxnLike, starts: Starts) => blockingAccount(t, starts) === null;

export type OpeningConflict = { accountId: string; accountName: string; openingDate: string };

/** For a draft: which account's opening date it falls before (opening balances themselves never conflict). */
export function openingConflict(draft: TxnDraft, master: Pick<MasterData, "accounts">): OpeningConflict | null {
  if (!draft.txnDate || !draft.accountId || draft.type === "OPENING_BALANCE") return null;
  const id = blockingAccount(
    {
      txn_date: draft.txnDate,
      account_id: draft.accountId,
      counter_account_id: draft.counter?.kind === "account" ? draft.counter.id : null,
    },
    startsFromMaster(master),
  );
  if (!id) return null;
  const account = master.accounts.find((a) => a.id === id)!;
  return { accountId: id, accountName: account.name, openingDate: account.openingDate! };
}

/** Group drafts dated before their account's opening date, per blocking account (import notes). */
export function groupBeforeOpening(drafts: TxnDraft[], master: Pick<MasterData, "accounts">): (OpeningConflict & { count: number })[] {
  const groups = new Map<string, OpeningConflict & { count: number }>();
  for (const d of drafts) {
    const c = openingConflict(d, master);
    if (!c) continue;
    const g = groups.get(c.accountId) ?? { ...c, count: 0 };
    g.count++;
    groups.set(c.accountId, g);
  }
  return [...groups.values()];
}

export type BalanceTxn = TxnLike & {
  id: string;
  direction: "DEBIT" | "CREDIT";
  amount: number | string;
  merchant?: string | null;
  description?: string | null;
};

/**
 * Effect of a transaction on an account's displayed balance (money held; for cards, amount owed).
 * DEBIT on the account = money out / card charge.
 */
export function accountEffect(t: BalanceTxn, accountId: string, type: AccountType): number {
  const amount = Number(t.amount);
  let held = 0;
  if (t.account_id === accountId) held += t.direction === "DEBIT" ? -amount : amount;
  if (t.counter_account_id === accountId) held += t.direction === "DEBIT" ? amount : -amount;
  return type === "credit_card" ? -held : held;
}

export function accountBalance(txns: BalanceTxn[], accountId: string, type: AccountType, starts: Starts): number {
  const total = txns.filter((t) => isCounted(t, starts)).reduce((s, t) => s + accountEffect(t, accountId, type), 0);
  return Math.round(total * 100) / 100;
}

export type OpeningPreview = {
  currentBalance: number;
  newBalance: number;
  /** Transactions that start counting with the new date (moving it earlier). */
  startCounting: BalanceTxn[];
  /** Transactions that stop counting with the new date (moving it later). */
  stopCounting: BalanceTxn[];
};

/**
 * Preview changing an account's opening balance to `newDate` / `newAmount`.
 * `txns` are all transactions touching the account (including its current opening balance, if any).
 */
export function previewOpeningChange(args: {
  txns: BalanceTxn[];
  accountId: string;
  accountType: AccountType;
  starts: Starts;
  newDate: string;
  newAmount: number;
}): OpeningPreview {
  const { txns, accountId, accountType, starts, newDate, newAmount } = args;
  const isOpening = (t: BalanceTxn) => t.type === "OPENING_BALANCE" && t.account_id === accountId;
  const opening = txns.find(isOpening);
  const others = txns.filter((t) => !isOpening(t));

  const newStarts = new Map(starts);
  newStarts.set(accountId, newDate);
  const newOpening: BalanceTxn = {
    id: opening?.id ?? "new-opening",
    type: "OPENING_BALANCE",
    txn_date: newDate,
    account_id: accountId,
    counter_account_id: null,
    direction: accountType === "credit_card" ? "DEBIT" : "CREDIT",
    amount: newAmount,
  };

  return {
    currentBalance: accountBalance(txns, accountId, accountType, starts),
    newBalance: accountBalance([...others, newOpening], accountId, accountType, newStarts),
    startCounting: others.filter((t) => !isCounted(t, starts) && isCounted(t, newStarts)),
    stopCounting: others.filter((t) => isCounted(t, starts) && !isCounted(t, newStarts)),
  };
}
