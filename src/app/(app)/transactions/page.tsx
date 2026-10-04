import type { Metadata } from "next";
import Link from "next/link";
import { loadMaster } from "@/lib/data";
import { headName } from "@/lib/engine/treatment";
import type { TxnType } from "@/lib/engine/types";
import { formatDate, inr, monthLabel, monthStart, todayIso, TXN_TYPE_LABELS } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { TransactionsTabs } from "./tabs";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : monthStart(todayIso());
  const accountFilter = typeof sp.account === "string" ? sp.account : "";

  const { supabase } = await requireUser();
  const master = await loadMaster(supabase);
  let query = supabase
    .from("transactions")
    .select("id, txn_date, type, direction, amount, account_id, counter_account_id, category_id, income_head_id, counter_system_head, merchant, description, source")
    .gte("txn_date", month)
    .lt("txn_date", monthStart(month, 1))
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (accountFilter) query = query.or(`account_id.eq.${accountFilter},counter_account_id.eq.${accountFilter}`);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const ym = (iso: string) => iso.slice(0, 7);
  const hrefFor = (m: string) => `/transactions?month=${ym(m)}${accountFilter ? `&account=${accountFilter}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Link href="/transactions/new" className="btn-primary">+ Add transaction</Link>
      </div>
      <TransactionsTabs active="list" />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={hrefFor(monthStart(month, -1))} className="btn-secondary" aria-label="Previous month">‹</Link>
        <span className="min-w-28 text-center text-sm font-medium">{monthLabel(month, "long")}</span>
        <Link href={hrefFor(monthStart(month, 1))} className="btn-secondary" aria-label="Next month">›</Link>
        <form className="ml-auto flex items-center gap-2">
          <input type="hidden" name="month" value={ym(month)} />
          <label htmlFor="account" className="sr-only">Account</label>
          <select id="account" name="account" defaultValue={accountFilter} className="input w-auto">
            <option value="">All accounts</option>
            {master.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center text-sm text-ink-2">
          No transactions in {monthLabel(month, "long")}.{" "}
          {master.accounts.length === 0 ? (
            <Link href="/accounts" className="text-brand underline">Add an account first.</Link>
          ) : (
            <Link href="/transactions/new" className="text-brand underline">Add one.</Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((t) => {
            const account = master.accounts.find((a) => a.id === t.account_id)?.name ?? "—";
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
            const out = t.direction === "DEBIT";
            return (
              <li key={t.id}>
                <Link href={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <div className="w-16 shrink-0 text-xs text-ink-3">{formatDate(t.txn_date).slice(0, 6)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.merchant || t.description || counter}</p>
                    <p className="truncate text-xs text-ink-3">
                      {TXN_TYPE_LABELS[t.type as TxnType]} · {account} {out ? "→" : "←"} {counter}
                      {t.source === "csv" && " · imported"}
                    </p>
                  </div>
                  <div className={`shrink-0 text-sm font-medium tabular ${out ? "text-ink" : "text-brand"}`}>
                    {out ? "−" : "+"}
                    {inr(t.amount)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
