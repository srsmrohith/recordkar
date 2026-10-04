import type { Metadata } from "next";
import Link from "next/link";
import type { AccountType } from "@/lib/engine/types";
import { ACCOUNT_TYPE_LABELS, inr, inrWhole, monthLabel, monthStart, todayIso } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

type Balance = { id: string; name: string; type: AccountType; balance: number; archived: boolean };
type Month = { month: string; hasData: boolean; income: number; expense: number; adjustments: number };

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const thisMonth = monthStart(todayIso());
  const firstMonth = monthStart(thisMonth, -3);

  const [balances, summary, queue, firstTxn] = await Promise.all([
    // All accounts, archived included: totals must never silently lose money.
    supabase.from("account_balances").select("id, name, type, balance, archived").order("name"),
    supabase.from("monthly_summary").select("month, income, expense, adjustments").gte("month", firstMonth),
    supabase.from("transaction_queue").select("amount").eq("status", "pending"),
    supabase.from("transactions").select("txn_date").order("txn_date").limit(1),
  ]);
  for (const r of [balances, summary, queue, firstTxn]) if (r.error) throw new Error(r.error.message);

  const allAccounts = (balances.data as Balance[]).map((a) => ({ ...a, balance: Number(a.balance) }));
  const accounts = allAccounts.filter((a) => !a.archived);
  // Archiving requires ₹0, but an old transaction could be edited afterwards; show any such money explicitly.
  const archivedWithMoney = allAccounts.filter((a) => a.archived && Math.round(a.balance * 100) !== 0);
  // Months before the first transaction show a dash rather than ₹0.00.
  const firstTxnMonth = firstTxn.data![0] ? monthStart(firstTxn.data![0].txn_date) : null;
  const months: Month[] = [0, -1, -2, -3].map((delta) => {
    const m = monthStart(thisMonth, delta);
    const row = summary.data!.find((r) => r.month === m);
    return {
      month: m,
      hasData: firstTxnMonth !== null && m >= firstTxnMonth,
      income: Number(row?.income ?? 0),
      expense: Number(row?.expense ?? 0),
      adjustments: Number(row?.adjustments ?? 0),
    };
  });

  // §4: Net balance = Bank + Cash (+ Wallet) − credit card outstanding. Phase 1 has no investments,
  // loans or receivables, so Net worth (assets − liabilities) is the same figure for now.
  const assets = allAccounts.filter((a) => a.type !== "credit_card").reduce((s, a) => s + a.balance, 0);
  const cardOutstanding = allAccounts.filter((a) => a.type === "credit_card").reduce((s, a) => s + a.balance, 0);
  const netBalance = assets - cardOutstanding;
  const netWorth = netBalance;

  const current = months[0];
  const surplus = current.income - current.expense;
  const pendingCount = queue.data!.length;
  const pendingTotal = queue.data!.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  if (allAccounts.length === 0) {
    return (
      <div className="card mx-auto max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold">Welcome to Recordkar</h1>
        <p className="text-sm text-ink-2">Start by adding the accounts you use — bank, cash, credit card or wallet — with their current balances.</p>
        <Link href="/accounts" className="btn-primary">Add your first account</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {/* Below 1024px the raised + in the bottom bar covers this. */}
        <div className="hidden lg:block">
          <Link href="/transactions/new" className="btn-primary px-5 py-2.5 text-base">
            + Add transaction
          </Link>
        </div>
      </div>

      {/* 1. Net worth + this month's surplus */}
      <section className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="card">
          <p className="text-xs font-medium text-ink-2">Net worth</p>
          <p className="mt-1 break-words text-4xl font-semibold tracking-tight sm:text-5xl">{inrWhole(netWorth)}</p>
          <p className="mt-2 text-xs text-ink-3">What you own minus what you owe, across your accounts.</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-ink-2">Surplus · {monthLabel(thisMonth, "long")}</p>
          <p className="mt-1 text-2xl font-semibold sm:text-3xl">
            {surplus < 0 ? "−" : ""}
            {inrWhole(Math.abs(surplus))}
          </p>
          <p className="mt-2 text-xs text-ink-3">
            {inrWhole(current.income)} income − {inrWhole(current.expense)} expenses
          </p>
        </div>
      </section>

      {/* 2. Imported transactions awaiting review — always shown, never folded into totals */}
      <Link
        href="/queue"
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          pendingCount > 0 ? "border-accent/40 bg-warn-bg text-warn-ink" : "border-border bg-surface text-ink-2"
        }`}
      >
        <span aria-hidden="true">{pendingCount > 0 ? "⏳" : "✓"}</span>
        <span className="flex-1">
          {pendingCount > 0 ? (
            <>
              <strong className="tabular">{inr(pendingTotal)}</strong> in {pendingCount} imported transaction{pendingCount === 1 ? "" : "s"} awaiting
              review — not yet included in the figures on this page.
            </>
          ) : (
            "No imported transactions awaiting review."
          )}
        </span>
        {pendingCount > 0 && <span className="font-medium">Review →</span>}
      </Link>

      {/* 4. Accounts (Budgets §3 and People §5 arrive in Phase 2) */}
      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Accounts</h2>
          <Link href="/accounts" className="-m-2 p-2 text-xs font-medium text-brand">Manage</Link>
        </div>
        <ul className="divide-y divide-border">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {a.name} <span className="text-xs text-ink-3">· {ACCOUNT_TYPE_LABELS[a.type]}</span>
              </span>
              <span className="tabular">
                {a.type === "credit_card" ? <span className="text-ink-2">{inr(a.balance)} due</span> : inr(a.balance)}
              </span>
            </li>
          ))}
          {archivedWithMoney.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm text-ink-2">
              <span>
                {a.name} <span className="text-xs text-ink-3">· archived</span>
              </span>
              <span className="tabular">{a.type === "credit_card" ? `${inr(a.balance)} due` : inr(a.balance)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
          <span>Net balance</span>
          <span className="tabular">{inr(netBalance)}</span>
        </div>
        <p className="mt-1 text-xs text-ink-3">Bank, cash and wallets minus credit card outstanding.</p>
      </section>

      {/* 6. Current month + previous 3 */}
      <MonthsSummary months={months} />

      <p className="text-center text-xs text-ink-3">For personal use only. Not intended for tax, audit, or statutory reporting purposes.</p>
    </div>
  );
}

function MonthsSummary({ months }: { months: Month[] }) {
  const surpluses = months.map((m) => m.income - m.expense);
  const scale = Math.max(...surpluses.map(Math.abs), 1);
  const adjusted = months.filter((m) => m.adjustments !== 0);

  return (
    <section className="card">
      <h2 className="mb-2 text-sm font-semibold">Last 4 months</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              <th className="py-1.5 pr-1 font-medium sm:pr-2">Month</th>
              <th className="px-1 py-1.5 text-right font-medium sm:px-2">Income</th>
              <th className="px-1 py-1.5 text-right font-medium sm:px-2">Expenses</th>
              <th className="px-1 py-1.5 text-right font-medium sm:px-2">Surplus</th>
              <th className="hidden w-1/4 min-w-24 py-1.5 pl-2 font-medium sm:table-cell">
                <span className="sr-only">Surplus bar</span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {months.map((m, i) => {
              const s = surpluses[i];
              const width = `${(Math.abs(s) / scale) * 50}%`;
              return (
                <tr key={m.month} className="border-t border-border">
                  <td className="whitespace-nowrap py-2 pr-1 sm:pr-2">{monthLabel(m.month)}</td>
                  <td className="whitespace-nowrap px-1 py-2 text-right sm:px-2">{m.hasData ? inr(m.income) : <NoData />}</td>
                  <td className="whitespace-nowrap px-1 py-2 text-right sm:px-2">{m.hasData ? inr(m.expense) : <NoData />}</td>
                  <td className="whitespace-nowrap px-1 py-2 text-right font-medium sm:px-2">
                    {m.hasData ? `${s < 0 ? "−" : ""}${inr(Math.abs(s))}` : <NoData />}
                  </td>
                  <td
                    className="hidden py-2 pl-2 sm:table-cell"
                    title={m.hasData ? `${monthLabel(m.month, "long")}: ${s < 0 ? "deficit" : "surplus"} ${inr(Math.abs(s))}` : "No transactions yet"}
                  >
                    <div className="relative h-3" aria-hidden="true">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      {m.hasData && s !== 0 && (
                        <div
                          className={`absolute inset-y-0.5 ${s > 0 ? "left-1/2 rounded-r bg-mark-pos" : "right-1/2 rounded-l bg-mark-neg"}`}
                          style={{ width }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {adjusted.length > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          Balance adjustments (not counted in surplus):{" "}
          {adjusted.map((m) => `${monthLabel(m.month)} ${m.adjustments < 0 ? "−" : "+"}${inr(Math.abs(m.adjustments))}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

/** Shown for months before the first recorded transaction. */
function NoData() {
  return (
    <span className="text-ink-3" title="No transactions recorded yet">
      —<span className="sr-only">no data</span>
    </span>
  );
}
