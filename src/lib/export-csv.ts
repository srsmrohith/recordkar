// CSV export of a filtered Transactions view.
import Papa from "papaparse";
import { headName } from "@/lib/engine/treatment";
import type { MasterData, SystemHead, TxnType } from "@/lib/engine/types";
import { TXN_TYPE_LABELS } from "@/lib/format";

export const EXPORT_DISCLAIMER = "For personal use only. Not intended for tax, audit, or statutory reporting purposes.";

export type ExportRow = {
  id: string;
  txn_date: string;
  value_date: string | null;
  type: TxnType;
  direction: "DEBIT" | "CREDIT";
  amount: number | string;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  income_head_id: string | null;
  counter_system_head: SystemHead | null;
  merchant: string | null;
  description: string | null;
  event_id: string | null;
  notes: string | null;
  source: string;
};

export const EXPORT_COLUMNS = [
  "Date",
  "Value Date",
  "Type",
  "Account",
  "Category / Other side",
  "Money in/out",
  "Amount",
  "Signed amount",
  "Merchant",
  "Description",
  "Event",
  "Reference",
  "Notes",
  "Source",
] as const;

/**
 * Spreadsheet apps run cells starting with = + - @ (or tab/CR) as formulas. Prefix such text with
 * an apostrophe so an exported merchant or note can never execute. Numbers are left as numbers.
 */
export function safeCell(value: string | null | undefined): string {
  const v = value ?? "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const nameOf = (list: { id: string; name: string }[], id: string | null) => (id ? list.find((x) => x.id === id)?.name ?? "" : "");

export function buildTransactionsCsv(
  rows: ExportRow[],
  master: MasterData,
  referencesByTxn: Map<string, string[]>,
  /** Extra lines after the disclaimer, e.g. how many transactions weren't counted. */
  notes: string[] = [],
): string {
  const data = rows.map((t) => {
    const amount = Number(t.amount);
    const out = t.direction === "DEBIT";
    const counter = headName(
      {
        side: "DR",
        amount: 0,
        account_id: t.counter_account_id ?? undefined,
        category_id: t.category_id ?? undefined,
        income_head_id: t.income_head_id ?? undefined,
        system_head: t.counter_system_head ?? undefined,
      },
      master,
    );
    return [
      t.txn_date,
      t.value_date ?? "",
      TXN_TYPE_LABELS[t.type],
      safeCell(nameOf(master.accounts, t.account_id)),
      safeCell(counter),
      out ? "Out" : "In",
      amount.toFixed(2),
      (out ? -amount : amount).toFixed(2),
      safeCell(t.merchant),
      safeCell(t.description),
      safeCell(nameOf(master.events, t.event_id)),
      safeCell((referencesByTxn.get(t.id) ?? []).join("; ")),
      safeCell(t.notes),
      t.source === "csv" ? "Imported" : t.source === "system" ? "Opening balance" : "Manual",
    ];
  });
  // Disclaimer first (requirements §8: every export carries it), then the table.
  const header = Papa.unparse([[EXPORT_DISCLAIMER], ...notes.map((n) => [n])]);
  return `${header}\r\n${Papa.unparse({ fields: [...EXPORT_COLUMNS], data })}\r\n`;
}
