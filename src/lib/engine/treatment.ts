import type {
  Component,
  Counter,
  Direction,
  MasterData,
  Side,
  SystemHead,
  TxnDraft,
  TxnType,
} from "./types";

/** Types whose direction is implied, so the user is never asked for it. */
export function fixedDirection(type: TxnType | null): Direction | null {
  switch (type) {
    case "EXPENSE":
      return "DEBIT";
    case "INCOME":
    case "REFUND":
      return "CREDIT";
    default:
      return null;
  }
}

/** Types whose counter side is a fixed system head. */
export function fixedSystemHead(type: TxnType | null): SystemHead | null {
  if (type === "ADJUSTMENT") return "balance_adjustment";
  if (type === "OPENING_BALANCE") return "opening_balance";
  return null;
}

/** Which kinds of counter side a type accepts. */
export function allowedCounterKinds(type: TxnType | null): Counter["kind"][] {
  switch (type) {
    case "EXPENSE":
    case "REFUND":
      return ["category"];
    case "INCOME":
      return ["income_head"];
    case "TRANSFER":
      return ["account"];
    case "ADJUSTMENT":
    case "OPENING_BALANCE":
      return ["system"];
    case "OTHER":
      return ["account", "category", "income_head"];
    default:
      return [];
  }
}

/** Fill in everything the type implies. Never invents user-supplied values. */
export function normalizeDraft(draft: TxnDraft): TxnDraft {
  const next = { ...draft };
  const dir = fixedDirection(next.type);
  if (dir) next.direction = dir;
  const head = fixedSystemHead(next.type);
  if (head) next.counter = { kind: "system", head };
  else if (next.counter && !allowedCounterKinds(next.type).includes(next.counter.kind)) next.counter = null;
  if (next.amount !== null) next.amount = Math.round(next.amount * 100) / 100;
  return next;
}

export type DraftField = "txnDate" | "type" | "direction" | "amount" | "account" | "counter" | "event";
export type Issues = Partial<Record<DraftField, string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function counterLabel(type: TxnType | null, direction: Direction | null): string {
  switch (type) {
    case "EXPENSE":
    case "REFUND":
      return "Category";
    case "INCOME":
      return "Income head";
    case "TRANSFER":
      return direction === "CREDIT" ? "From account" : "To account";
    default:
      return "Linked to";
  }
}

/**
 * Ask for missing required inputs (Rupevo §2): returns one message per incomplete field.
 * An empty result means the draft can be approved and posted.
 */
export function validateDraft(input: TxnDraft, master: MasterData): Issues {
  const d = normalizeDraft(input);
  const issues: Issues = {};

  if (!d.txnDate) issues.txnDate = "Date is required";
  else if (!isValidIsoDate(d.txnDate)) issues.txnDate = "Date is not valid";

  if (!d.type) issues.type = "Choose a transaction type";

  if (d.amount === null || !Number.isFinite(d.amount)) issues.amount = "Amount is required";
  else if (d.amount <= 0) issues.amount = "Amount must be more than zero";
  else if (d.amount >= 1e12) issues.amount = "Amount is too large";

  const account = master.accounts.find((a) => a.id === d.accountId);
  if (!d.accountId || !account) issues.account = "Choose an account";

  if (d.type) {
    const implied = fixedDirection(d.type);
    if (!d.direction) issues.direction = "Choose Debit (money out) or Credit (money in)";
    else if (implied && input.direction && input.direction !== implied) {
      issues.direction =
        d.type === "EXPENSE"
          ? "An expense is always a Debit. For money coming back, use Refund."
          : `${d.type === "INCOME" ? "Income" : "A refund"} is always a Credit.`;
    }

    const c = d.counter;
    if (!c) {
      issues.counter = `${counterLabel(d.type, d.direction)} is required`;
    } else if (c.kind === "account") {
      const other = master.accounts.find((a) => a.id === c.id);
      if (!other) issues.counter = "Choose the other account";
      else if (c.id === d.accountId) issues.counter = "A transfer needs two different accounts";
    } else if (c.kind === "category" && !master.categories.some((x) => x.id === c.id)) {
      issues.counter = "Choose a category";
    } else if (c.kind === "income_head" && !master.incomeHeads.some((x) => x.id === c.id)) {
      issues.counter = "Choose an income head";
    }
  }

  if (d.eventId && !master.events.some((e) => e.id === d.eventId)) issues.event = "Unknown event";

  return issues;
}

export const hasIssues = (issues: Issues) => Object.keys(issues).length > 0;

function counterComponent(counter: Counter, side: Side, amount: number): Component {
  switch (counter.kind) {
    case "account":
      return { side, amount, account_id: counter.id };
    case "category":
      return { side, amount, category_id: counter.id };
    case "income_head":
      return { side, amount, income_head_id: counter.id };
    case "system":
      return { side, amount, system_head: counter.head };
  }
}

/**
 * Accounting components for a complete draft. The account leg follows the statement direction:
 * money out (DEBIT) credits the account in the books; money in (CREDIT) debits it.
 * This holds for credit cards too — a card charge credits the card liability.
 */
export function buildComponents(input: TxnDraft): Component[] {
  const d = normalizeDraft(input);
  if (!d.direction || !d.accountId || !d.counter || !d.amount) {
    throw new Error("buildComponents called with an incomplete draft");
  }
  const accountSide: Side = d.direction === "DEBIT" ? "CR" : "DR";
  const counterSide: Side = accountSide === "DR" ? "CR" : "DR";
  return [
    { side: accountSide, amount: d.amount, account_id: d.accountId },
    counterComponent(d.counter, counterSide, d.amount),
  ];
}

export function isBalanced(components: Component[]): boolean {
  const sum = (side: Side) =>
    Math.round(components.filter((c) => c.side === side).reduce((s, c) => s + c.amount * 100, 0));
  return components.length >= 2 && sum("DR") === sum("CR");
}

const SYSTEM_HEAD_NAMES: Record<SystemHead, string> = {
  opening_balance: "Opening Balance",
  balance_adjustment: "Balance Adjustment",
};

export function headName(c: Component, master: MasterData): string {
  if (c.account_id) return master.accounts.find((a) => a.id === c.account_id)?.name ?? "Account";
  if (c.category_id) return master.categories.find((x) => x.id === c.category_id)?.name ?? "Category";
  if (c.income_head_id) return master.incomeHeads.find((x) => x.id === c.income_head_id)?.name ?? "Income";
  if (c.system_head) return SYSTEM_HEAD_NAMES[c.system_head];
  return "—";
}

export type TreatmentLine = { side: Side; head: string; amount: number };

/** The proposed accounting treatment shown before the user approves (Rupevo §2). */
export function describeTreatment(
  input: TxnDraft,
  master: MasterData,
): { lines: TreatmentLine[]; summary: string } | null {
  if (hasIssues(validateDraft(input, master))) return null;
  const d = normalizeDraft(input);
  const components = buildComponents(d);
  const lines = components
    .map((c) => ({ side: c.side, head: headName(c, master), amount: c.amount }))
    .sort((a, b) => (a.side === b.side ? 0 : a.side === "DR" ? -1 : 1));

  const account = master.accounts.find((a) => a.id === d.accountId)!;
  const isCard = account.type === "credit_card";
  const moneyOut = d.direction === "DEBIT";
  const effect = isCard
    ? moneyOut
      ? `${account.name} outstanding goes up`
      : `${account.name} outstanding goes down`
    : moneyOut
      ? `${account.name} balance goes down`
      : `${account.name} balance goes up`;

  const counterName = headName(components[1], master);
  const summaries: Record<TxnType, string> = {
    EXPENSE: `Spend recorded once under ${counterName}; ${effect}.`,
    INCOME: `Income under ${counterName}; ${effect}.`,
    TRANSFER: `Movement between your own accounts — not income or expense; ${effect}.`,
    REFUND: `Reduces spending under ${counterName}; ${effect}.`,
    ADJUSTMENT: `Balance correction, shown separately and excluded from income, expenses and surplus; ${effect}.`,
    OPENING_BALANCE: `Starting balance — not income, not counted in any month's surplus.`,
    OTHER: `${effect}; other side: ${counterName}.`,
  };
  return { lines, summary: summaries[d.type!] };
}

/** Snake-case payload for the post_transaction / update_transaction RPCs. */
export function toTxnPayload(input: TxnDraft, source: "manual" | "csv" | "system") {
  const d = normalizeDraft(input);
  const c = d.counter;
  return {
    txn_date: d.txnDate,
    value_date: d.valueDate || null,
    type: d.type,
    direction: d.direction,
    amount: d.amount,
    account_id: d.accountId,
    counter_account_id: c?.kind === "account" ? c.id : null,
    category_id: c?.kind === "category" ? c.id : null,
    income_head_id: c?.kind === "income_head" ? c.id : null,
    counter_system_head: c?.kind === "system" ? c.head : null,
    merchant: d.merchant,
    description: d.description,
    event_id: d.eventId,
    notes: d.notes,
    reference: d.reference,
    source,
  };
}

/** Columns shared by `transactions` and `transaction_queue` rows. */
export type DraftRow = {
  txn_date: string | null;
  value_date: string | null;
  type: TxnType | null;
  direction: Direction | null;
  amount: number | string | null;
  account_id: string | null;
  counter_account_id: string | null;
  category_id: string | null;
  income_head_id: string | null;
  counter_system_head: SystemHead | null;
  merchant: string | null;
  description: string | null;
  event_id: string | null;
  notes: string | null;
  reference?: string | null;
};

export function draftFromRow(row: DraftRow): TxnDraft {
  const counter: Counter | null = row.counter_account_id
    ? { kind: "account", id: row.counter_account_id }
    : row.category_id
      ? { kind: "category", id: row.category_id }
      : row.income_head_id
        ? { kind: "income_head", id: row.income_head_id }
        : row.counter_system_head
          ? { kind: "system", head: row.counter_system_head }
          : null;
  return {
    txnDate: row.txn_date,
    valueDate: row.value_date,
    type: row.type,
    direction: row.direction,
    amount: row.amount === null ? null : Number(row.amount),
    accountId: row.account_id,
    counter,
    merchant: row.merchant,
    description: row.description,
    eventId: row.event_id,
    notes: row.notes,
    reference: row.reference ?? null,
  };
}

/** Queue-row columns for a draft (inverse of draftFromRow). */
export function draftToRow(input: TxnDraft): DraftRow {
  const p = toTxnPayload(input, "csv");
  return {
    txn_date: p.txn_date,
    value_date: p.value_date,
    type: p.type,
    direction: input.direction,
    amount: p.amount,
    account_id: p.account_id,
    counter_account_id: p.counter_account_id,
    category_id: p.category_id,
    income_head_id: p.income_head_id,
    counter_system_head: p.counter_system_head,
    merchant: p.merchant,
    description: p.description,
    event_id: p.event_id,
    notes: p.notes,
    reference: p.reference,
  };
}
