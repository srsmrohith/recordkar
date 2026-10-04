# Phase 1 Decisions

Decisions made on 2026-10-04 while starting Phase 1 (core transaction engine, Queue, Dashboard).
They fill gaps in `recordkar-requirements.md` and `rupevo-original-requirements.md`.

## Scope and platform
- Phase 1 stores data directly in Supabase (Postgres) with RLS on every table. Local-only Free tier storage is Phase 4.
- Login is required. Sign-in is **email magic link** using Supabase's default email (PKCE flow):
  the user enters their email, clicks the link, and lands signed in via `/auth/callback`.
  The link must be opened in the same browser that requested it.
  Open decision #8 (anonymous Free trial) stays open until Phase 4.
- *Updated 2026-10-04:* the original plan was a typed email code (OTP), but Supabase doesn't allow
  editing email templates (needed to show `{{ .Token }}`) without custom SMTP. **Later:** configure custom
  SMTP, then add code entry (useful for the installed PWA, where a link opens in the browser instead of the
  app). Phone OTP still follows once an SMS provider is configured.
- The app uses only the publishable key. The secret key bypasses RLS and is not used by Phase 1 code.

## Accounting model
| Scenario | Dr | Cr |
|---|---|---|
| Expense (bank/cash/wallet) | Expense category | Account |
| Expense (credit card) | Expense category | Credit card (liability) |
| Income | Account | Income head (active/passive) |
| Transfer | Destination account | Source account |
| Card bill payment | Credit card | Bank |
| Refund | Account | Original expense category (reduces spend) |
| Adjustment | Account / Balance Adjustment (by direction) | Balance Adjustment / Account |
| Opening balance | Account | Opening Balance (equity) — reversed for credit cards |
| Other | User picks the counter side manually | |

- Statement direction: DEBIT = money out of / charged to the account (account is credited in the books); CREDIT = money in.
- Dr must equal Cr per transaction — enforced by a deferred database constraint trigger.
- **Opening balances** are posted as an Opening Balance entry against an equity head; never income, never in surplus.
- **Adjustments** post against a Balance Adjustment head, shown explicitly, excluded from income/expense/surplus.
- **Net Worth** = assets − liabilities. In Phase 1 it equals Net Balance (Bank + Cash + Wallet − card outstanding);
  they diverge once investments, loans and receivables exist.
- **Monthly surplus** = income − expenses (event spending included, per Rupevo §8).

## Data
- Account types in Phase 1: Bank, Cash, Credit card, Wallet (Wallet counts like Bank/Cash in Net Balance).
- New users get editable default expense categories and income heads (seeded on sign-up).
- Events are a Phase 1 tag master. Person/Group values from CSV are kept as raw text on the Queue item and mapped in Phase 2.

## Edits
- Posted transactions can be edited or deleted. Edits go back through Review & Post; every change is recorded in the
  **Edit log (stored in the audit_history table)** with before/after snapshots.
- The Edit log shows, per edit, one row per changed field with a friendly label and old → new value
  (e.g. "Amount: ₹480 → ₹520"), computed by comparing the stored snapshots. Technical fields (ids, timestamps,
  source) are ignored; debit/credit line changes are summarised as one "Accounting entry" row when the heads change.
  Posted entries show their key fields; deleted entries show what was removed (date, account, amount, category,
  merchant) and stay in the log. Times are India time. Amounts in the Edit log keep paise (e.g. "₹480.00 → ₹520.00").
  Reached from each transaction ("View edit log") and from the Edit log tab inside Transactions
  (`/transactions/edit-log`); it is not in the main menu.

## Queue and import
- Phase 1 includes a basic **CSV** upload of the Rupevo template columns. Excel template, bank-statement parsing
  and history-based auto-categorisation remain Phase 3.
- Every non-empty CSV row becomes a Queue item; anything missing or unresolvable is asked for on the card,
  and approval stays disabled until required fields are complete.
- Duplicates are **flagged, never auto-dropped**: same account + same Reference is skipped automatically (count shown);
  fuzzy matches (same account, exact amount, date ±2 days, similar description) are flagged with Keep/Discard.
  Manual entry shows the same warning before posting.

## Dashboard
- Budgets (section 3) and People (section 5) are hidden until Phase 2.
- The EMI principal line (open decision #3) does not appear in Phase 1 because there are no loans yet.
- A prominent "Add transaction" button sits at the top of the Dashboard.
- Headline numbers (Net worth, this month's surplus) show whole rupees; transaction lists and entries keep paise.
- In the "Last 4 months" table, months before the first transaction show "—" instead of ₹0.00.

## Navigation
- Main menu: Dashboard, Transactions, Accounts, Queue, Import, Master data. The Queue item shows the pending
  count, e.g. "Queue (12)".
- Transactions has two tabs: All transactions and Edit log.
- **Master data** (expense categories, income heads, events) replaces the earlier "Settings" page; `/settings`
  redirects to `/master-data` with a temporary (307) redirect so the name stays free.
- **Settings** is reserved for future preferences — alerts, backup & restore, plan, profile — and is not built yet.
- **Below 1024px** (phones and tablets) a bottom tab bar replaces the top menu: Home · Transactions · raised **+** ·
  Queue (count badge) · More. The **+** opens a sheet with "Add transaction" and "Import file", so importing is
  at most two taps from any screen. **More** holds Accounts, Import, Master data and Sign out (Settings joins it
  when built). Accounts also stays one tap away through "Manage" on the Dashboard's Accounts card.
- **From 1024px up**, the top menu is shown; the signed-in email appears next to Sign out from 1280px.
- Phone layout: smaller Dashboard headline numbers; the "Last 4 months" table drops its bar column; the Queue's
  bulk-action toolbar collapses to "N selected · Actions ▾".
