import Papa from "papaparse";
import { isValidIsoDate, type DraftField } from "./treatment";
import { TXN_TYPES, emptyDraft, type Counter, type Direction, type MasterData, type TxnDraft, type UserTxnType } from "./types";

/** Recordkar template columns (Rupevo §3), in template order. */
export const TEMPLATE_COLUMNS = [
  "Transaction Date",
  "Value Date",
  "Account",
  "Transaction Type",
  "Amount",
  "Debit/Credit",
  "Category",
  "Description",
  "Merchant",
  "Person",
  "Group",
  "Event",
  "Reference",
  "Notes",
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

export const REQUIRED_COLUMNS: TemplateColumn[] = [
  "Transaction Date",
  "Account",
  "Transaction Type",
  "Amount",
  "Debit/Credit",
];

export const MAX_ROWS = 2000;

export type RawRow = Partial<Record<TemplateColumn, string>>;

export type ParsedFile =
  | { ok: true; rows: { rowNumber: number; raw: RawRow }[] }
  | { ok: false; error: string };

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

export function parseTemplateCsv(text: string): ParsedFile {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const [header, ...body] = result.data;
  if (!header) return { ok: false, error: "The file is empty." };

  const index = new Map<TemplateColumn, number>();
  header.forEach((h, i) => {
    const col = TEMPLATE_COLUMNS.find((c) => normHeader(c) === normHeader(h));
    if (col && !index.has(col)) index.set(col, i);
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
  if (missing.length) {
    return { ok: false, error: `Missing required column(s): ${missing.join(", ")}. Use the Recordkar template.` };
  }
  if (body.length > MAX_ROWS) {
    return { ok: false, error: `Too many rows (${body.length}). Upload at most ${MAX_ROWS} at a time.` };
  }

  const rows = body
    .map((cells, i) => {
      const raw: RawRow = {};
      for (const [col, idx] of index) {
        const v = (cells[idx] ?? "").trim();
        if (v) raw[col] = v;
      }
      return { rowNumber: i + 2, raw }; // +2: 1-based, after header row
    })
    .filter((r) => Object.keys(r.raw).length > 0);
  return { ok: true, rows };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and DD-Mon-YYYY (Indian statement formats). */
export function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]];
  else if ((match = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [+match[1], +match[2], +match[3]];
  else if ((match = v.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/-](\d{4})$/))) {
    const mi = MONTHS.indexOf(match[2].toLowerCase());
    if (mi < 0) return null;
    [d, m, y] = [+match[1], mi + 1, +match[3]];
  } else return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[₹,\s]|INR|Rs\.?/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100) / 100;
}

function parseDirection(value: string | undefined): Direction | null {
  const v = value?.trim().toUpperCase();
  if (v === "DEBIT" || v === "DR" || v === "D") return "DEBIT";
  if (v === "CREDIT" || v === "CR" || v === "C") return "CREDIT";
  return null;
}

const byName = <T extends { name: string; archived?: boolean }>(list: T[], name: string | undefined) =>
  name ? list.find((x) => !x.archived && x.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined;

export type ResolvedRow = {
  draft: TxnDraft;
  /** Import-time problems with the uploaded values, keyed by field. */
  issues: Partial<Record<DraftField, string>>;
  personText: string | null;
  groupText: string | null;
};

/** Map one template row onto a draft. Unresolvable values are left empty and explained, never guessed. */
export function resolveRow(raw: RawRow, master: MasterData): ResolvedRow {
  const draft = emptyDraft();
  const issues: ResolvedRow["issues"] = {};

  const date = raw["Transaction Date"];
  draft.txnDate = parseDate(date);
  if (!draft.txnDate) issues.txnDate = date ? `Couldn't read date "${date}"` : "Date is missing";
  draft.valueDate = parseDate(raw["Value Date"]);

  const typeText = raw["Transaction Type"]?.toUpperCase();
  draft.type = TXN_TYPES.includes(typeText as UserTxnType) ? (typeText as UserTxnType) : null;
  if (!draft.type) {
    issues.type = typeText ? `Unknown type "${raw["Transaction Type"]}"` : "Transaction type is missing";
  }

  const amount = parseAmount(raw["Amount"]);
  if (amount === null) issues.amount = raw["Amount"] ? `Couldn't read amount "${raw["Amount"]}"` : "Amount is missing";
  else if (amount <= 0) issues.amount = "Amount must be positive — use Debit/Credit for direction";
  else draft.amount = amount;

  draft.direction = parseDirection(raw["Debit/Credit"]);
  if (!draft.direction) {
    issues.direction = raw["Debit/Credit"] ? `"${raw["Debit/Credit"]}" is not DEBIT or CREDIT` : "Debit/Credit is missing";
  }

  const account = byName(master.accounts, raw["Account"]);
  draft.accountId = account?.id ?? null;
  if (!account) issues.account = raw["Account"] ? `No account named "${raw["Account"]}"` : "Account is missing";

  const cat = raw["Category"];
  let counter: Counter | null = null;
  if (draft.type === "EXPENSE" || draft.type === "REFUND") {
    const c = byName(master.categories, cat);
    if (c) counter = { kind: "category", id: c.id };
    else if (cat) issues.counter = `No category named "${cat}"`;
  } else if (draft.type === "INCOME") {
    const h = byName(master.incomeHeads, cat);
    if (h) counter = { kind: "income_head", id: h.id };
    else if (cat) issues.counter = `No income head named "${cat}"`;
  } else if (draft.type === "OTHER" && cat) {
    const matches: Counter[] = [
      ...master.categories.filter((x) => byName([x], cat)).map((x) => ({ kind: "category" as const, id: x.id })),
      ...master.incomeHeads.filter((x) => byName([x], cat)).map((x) => ({ kind: "income_head" as const, id: x.id })),
      ...master.accounts.filter((x) => byName([x], cat)).map((x) => ({ kind: "account" as const, id: x.id })),
    ];
    if (matches.length === 1) counter = matches[0];
    else issues.counter = matches.length ? `"${cat}" matches more than one ledger head` : `Nothing named "${cat}"`;
  }
  draft.counter = counter;

  const eventText = raw["Event"];
  const event = byName(master.events, eventText);
  draft.eventId = event?.id ?? null;
  if (eventText && !event) issues.event = `No event named "${eventText}"`;

  draft.merchant = raw["Merchant"] ?? null;
  draft.description = raw["Description"] ?? null;
  draft.reference = raw["Reference"] ?? null;
  draft.notes = raw["Notes"] ?? null;

  return { draft, issues, personText: raw["Person"] ?? null, groupText: raw["Group"] ?? null };
}

/** Downloadable template with one example row. */
export function templateCsv(): string {
  const example: Record<TemplateColumn, string> = {
    "Transaction Date": "2026-10-01",
    "Value Date": "",
    Account: "HDFC Savings",
    "Transaction Type": "EXPENSE",
    Amount: "480.00",
    "Debit/Credit": "DEBIT",
    Category: "Food & Dining",
    Description: "UPI/SWIGGY/dinner",
    Merchant: "Swiggy",
    Person: "",
    Group: "",
    Event: "",
    Reference: "UPI-428193",
    Notes: "Delete this example row",
  };
  return Papa.unparse({ fields: [...TEMPLATE_COLUMNS], data: [TEMPLATE_COLUMNS.map((c) => example[c])] }) + "\r\n";
}
