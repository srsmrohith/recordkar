import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { loadMaster } from "@/lib/data";
import { headName } from "@/lib/engine/treatment";
import type { TxnType } from "@/lib/engine/types";
import { formatDate, inr, monthLabel, monthStart, todayIso, TXN_TYPE_LABELS } from "@/lib/format";
import { isNoticeKind } from "@/lib/notice";
import { requireUser } from "@/lib/supabase/server";
import { activeFilterCount, filtersToQuery, parseTxnFilters, type TxnFilters } from "@/lib/txn-filters";
import { queryTransactions } from "@/lib/txn-query";
import { TransactionsTabs } from "./tabs";

export const metadata: Metadata = { title: "Transactions" };

const LIST_LIMIT = 500;

function scopeLabel(f: TxnFilters): string {
  if (f.dates.mode === "all") return "All dates";
  if (f.dates.mode === "month") return monthLabel(f.dates.month, "long");
  const { from, to } = f.dates;
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  return from ? `From ${formatDate(from)}` : `Up to ${formatDate(to)}`;
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const today = todayIso();
  const filters = parseTxnFilters(sp, today);
  const notice = isNoticeKind(sp.notice) ? sp.notice : null;

  const { supabase } = await requireUser();
  const [master, result] = await Promise.all([loadMaster(supabase), queryTransactions(supabase, filters, LIST_LIMIT + 1)]);
  if (result.error) throw new Error(result.error.message);
  const rows = result.data.slice(0, LIST_LIMIT);
  const truncated = result.data.length > LIST_LIMIT;

  const extra = activeFilterCount(filters);
  const filtersOpen = extra > 0 || filters.dates.mode !== "month";
  const monthMode = filters.dates.mode === "month" ? filters.dates.month : null;
  const href = (overrides: Partial<TxnFilters>) => `/transactions?${filtersToQuery(filters, overrides)}`;
  const exportHref = `/transactions/export?${filtersToQuery(filters)}`;
  const counterValue = filters.counter ? `${filters.counter.kind}:${filters.counter.id}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Link href="/transactions/new" className="btn-primary">+ Add transaction</Link>
      </div>
      {notice && <Notice kind={notice} />}
      <TransactionsTabs active="list" />

      <div className="flex flex-wrap items-center gap-2">
        {monthMode ? (
          <>
            <Link href={href({ dates: { mode: "month", month: monthStart(monthMode, -1) } })} className="btn-secondary" aria-label="Previous month">‹</Link>
            <span className="min-w-28 text-center text-sm font-medium">{scopeLabel(filters)}</span>
            <Link href={href({ dates: { mode: "month", month: monthStart(monthMode, 1) } })} className="btn-secondary" aria-label="Next month">›</Link>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">{scopeLabel(filters)}</span>
            <Link href={href({ dates: { mode: "month", month: monthStart(today) } })} className="btn-ghost text-xs">This month</Link>
          </>
        )}
        <a href={exportHref} className="btn-secondary ml-auto" download>Export CSV</a>
      </div>

      <details className="card p-0" open={filtersOpen}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Filters{extra > 0 ? ` (${extra})` : ""}
        </summary>
        <form className="grid grid-cols-1 gap-3 border-t border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthMode && <input type="hidden" name="month" value={monthMode.slice(0, 7)} />}
          <div className="sm:col-span-2">
            <label htmlFor="f-q" className="label">Search merchant or description</label>
            <input id="f-q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder="e.g. Swiggy" className="input" />
          </div>
          <div>
            <label htmlFor="f-account" className="label">Account</label>
            <select id="f-account" name="account" defaultValue={filters.account ?? ""} className="input">
              <option value="">All accounts</option>
              {master.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.archived ? " (archived)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-category" className="label">Category</label>
            <select id="f-category" name="category" defaultValue={counterValue} className="input">
              <option value="">All categories</option>
              <optgroup label="Expense categories">
                {master.categories.map((c) => (
                  <option key={c.id} value={`category:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Income heads">
                {master.incomeHeads.map((h) => (
                  <option key={h.id} value={`income_head:${h.id}`}>{h.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label htmlFor="f-event" className="label">Event</label>
            <select id="f-event" name="event" defaultValue={filters.event ?? ""} className="input">
              <option value="">Any event</option>
              {master.events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="f-min" className="label">Amount from (₹)</label>
              <input id="f-min" name="min" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={filters.min ?? ""} className="input tabular" />
            </div>
            <div>
              <label htmlFor="f-max" className="label">to (₹)</label>
              <input id="f-max" name="max" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={filters.max ?? ""} className="input tabular" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <div>
              <label htmlFor="f-from" className="label">From date</label>
              <input id="f-from" name="from" type="date" defaultValue={filters.dates.mode === "range" ? (filters.dates.from ?? "") : ""} className="input" />
            </div>
            <div>
              <label htmlFor="f-to" className="label">To date</label>
              <input id="f-to" name="to" type="date" defaultValue={filters.dates.mode === "range" ? (filters.dates.to ?? "") : ""} className="input" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="all" value="1" defaultChecked={filters.dates.mode === "all"} />
              All dates
            </label>
            <button className="btn-primary">Apply filters</button>
            <Link href="/transactions" className="btn-ghost">Clear</Link>
            <span className="text-xs text-ink-3">Leave the dates empty to browse month by month.</span>
          </div>
        </form>
      </details>

      {rows.length > 0 && (
        <p className="text-xs text-ink-2 tabular">
          {rows.length}
          {truncated ? "+" : ""} transaction{rows.length === 1 ? "" : "s"}
          {truncated && ` — showing the latest ${LIST_LIMIT}; narrow the filters or export to see all`}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card text-center text-sm text-ink-2">
          {extra > 0 ? "No transactions match these filters." : `No transactions in ${scopeLabel(filters)}.`}{" "}
          {master.accounts.length === 0 ? (
            <Link href="/accounts" className="text-brand underline">Add an account first.</Link>
          ) : extra > 0 ? (
            <Link href="/transactions" className="text-brand underline">Clear filters</Link>
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
            const event = t.event_id ? master.events.find((e) => e.id === t.event_id)?.name : null;
            return (
              <li key={t.id}>
                <Link href={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <div className="w-14 shrink-0 self-start pt-0.5 text-xs text-ink-3">
                    {formatDate(t.txn_date).slice(0, 6)}
                    {!monthMode && <span className="block">{t.txn_date.slice(0, 4)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.merchant || t.description || counter}</p>
                    <p className="break-words text-xs text-ink-3">
                      {TXN_TYPE_LABELS[t.type as TxnType]} · {account}
                      {/* Opening balances and adjustments have no real "other side" worth showing. */}
                      {!t.counter_system_head && ` ${out ? "→" : "←"} ${counter}`}
                      {event && ` · ${event}`}
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
