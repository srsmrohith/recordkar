# Recordkar — Consolidated Requirements & Decisions

**Personal Financial Operating System, built on the original Rupevo requirements, renamed and extended**

*This document consolidates every decision made in the Recordkar planning conversation into one build-ready reference. It supersedes nothing in the original user-provided requirements — it extends and sequences them.*

---

## 1. Identity

| Item | Decision |
|---|---|
| Name | Recordkar |
| Tagline | "Know where your money stands." |
| Logo | Circular teal mark (`#0F6E56` light / `#1D9E75` dark) with white ledger lines + amber checkmark badge (`#BA7517` light / `#EF9F27` dark). Wordmark: wide-tracked uppercase RECORD**KAR**, KAR in green. |
| Core identity statement | Recordkar records the user's personal transactions and keeps them safe. Reports and dashboard are for the user's own understanding — not for tax filing, audits, statutory compliance, or business bookkeeping. Every report carries this disclaimer. |
| Product principle | Simple for the user, sophisticated backend. Never Detect → Guess → Post. |

---

## 2. Core Transaction Engine (unchanged from original requirements)

External Transaction → Internal Transaction → Accounting Components

Workflow: Detect → Identify → Classify → Ask for Missing Required Inputs → Validate → Show Proposed Accounting Treatment → User Approval → Post → Reconcile.

**Decision: Manual entry bypasses the Queue.** Since the user fills every field themselves, there's no missing-information problem to resolve later. Manual entry flow: fill form → see proposed Dr/Cr treatment inline → "Review & Post" → done, in one pass. The approval gate still applies — it just happens inline instead of via a second trip to a queue.

**Queue is reserved exclusively for Import and auto-detected sources** — template upload, bank statement upload, future email/SMS detection, and AI-chat-parsed entries. These need review because the app isn't fully confident in them.

**Duplicate prevention must work across all sources** — manual, upload, SMS, email, AI-chat. One real-world transaction = one record, regardless of channel. Matching likely needs tolerance (date within a day or two, amount exact, merchant/description similarity) rather than exact-field equality, since different sources carry different levels of detail for the same event.

**Validation rule to add formally:** every posted transaction's Dr components must sum to its Cr components before posting — explicit double-entry integrity check, not just implied by examples.

---

## 3. Queue Review — full metadata, inline editing

All transaction attributes — Category, Merchant, Person, Group, Event/Occasional tag, Notes — are settable **inline on the Queue card at review time**, not via separate screens or popups. Required/common fields (Category, Merchant) shown by default; optional ones (Group, Event, Notes) under an expandable "More details" section.

**Auto-categorisation from history:** on import, the app proposes category/treatment based on previously approved transactions matching merchant/description patterns. This only pre-fills the Queue card — it never bypasses the approval gate.

**Bulk approve:** user can select and approve multiple Queue items sharing the same nature/description at once (e.g. 20 similar "Swiggy" debits).

**Person-matching suggestions, both directions:**
- Incoming credit matching a known person → "Looks like a settlement from Dilip," tapping it opens the Settlement screen pre-filled with the real transaction amount.
- Outgoing debit matching a known person → inline "Treat as: Settlement / Expense" and "Person" dropdowns right on the card.

---

## 4. Accounts & Net Balance

- **Net balance** (label must be distinct from Net Worth) = Bank + Cash − Credit card current outstanding.
- **Credit card EMI principal is excluded from Net Balance** and shown as its own separate, muted line — so a running EMI doesn't make everyday spendable balance look artificially negative.
- EMI principal shown here must read from the same source as the Loans module's reconstruction (§6 of original doc) — never a separately maintained number.
- Only show the EMI principal line when nonzero.
- Same net-balance logic (exclude EMI principal from the everyday number) likely applies to any EMI-bearing account, not just credit cards — open decision on scope.

---

## 5. People, Groups, Settlements, Write-offs

**Groups**
- Represent a trip, family event, or standing arrangement (roommates). Members are selected from People master data, never typed freeform.
- Lifecycle: **Active / Closed**, shown in separate tabs. Closing a group with an unsettled balance shows a confirmation naming the exact amount, which becomes a write-off added to the user's own expenses only on explicit confirmation.
- **Budget linkage, optional, bidirectional:**
  - Plan a budget first (e.g. "Goa"), map it when creating the group, OR
  - Click "Add Budget" inline during group creation → fill details → redirected back to group creation exactly where left off.
  - Budget name auto-derives from the Group name.
  - Either path lands in the same Budgets feature — no special "group budget" type.
  - **Decision needed before Phase 2:** does closing a group also lock/freeze its linked budget, so "budget vs. actual" is final once the trip is closed? (Recommended: yes.)

**Group expense entry**
- Split methods: Equal / Exact amount / Percentage. Members can be tapped to exclude from a particular expense.
- "Paid by" defaults to any group member, not always the user.
- **Decision needed before Phase 2:** when Exact amount split doesn't sum to the total, block "Add expense" or auto-adjust the last person's share?

**How a group expense links to a real transaction**
- **Paid by you:** one real transaction (e.g. one DEBIT on your account) splits into multiple accounting components — your share → Expense, others' shares → Receivables. Money leaves your account exactly once.
- **Paid by someone else:** no transaction touches your account at all. Only your share as a Payable is recorded. It becomes a real transaction later, at settlement.

**Person-level net balance**
- Computed as the **net across every source** for that person — Personal Ledger entries + every Group they're part of — not a separate number per group.
- Settlement entries must adjust both the person-level balance AND the relevant Group balance(s) simultaneously.
- UI should be able to show the breakdown by source, not just the netted figure.

**Partial settlement — supported**
- A payment can be partial (e.g. ₹1,000 of ₹1,500 owed).
- Allocation across multiple outstanding sources: **user can set manually, defaults to FIFO (oldest due cleared first)** if unspecified.

**Write-off**
- Needs a formal accounting treatment added to the Accounting Treatment Examples table: a write-off of an amount owed to you is a loss/expense (Dr Expense: Write-off, Cr Receivable).
- Same mechanism whether triggered manually (idea: forgive a small balance anytime) or via group closure — one treatment, two triggers, not two treatments.
- Once written off, the amount must drop out of the person's net receivable/payable — it shouldn't be double-counted as both "written off" and "still owed."

---

## 6. Budgets

- User can plan budgets separately: standing monthly budgets, and per-Group budgets (trip/event), linked as described in §5.
- Budget tracks the **user's own share only**, not gross group spend.
- Configurable overspend alerts (threshold, frequency — user-adjustable, per original §13).
- Reports show spend vs. budget per envelope separately.

---

## 7. Dashboard — "simple and clear" as a design constraint

Order of information, top to bottom:
1. Net worth + this month's surplus
2. **Uncategorised/pending banner** — total amount still in the Queue, shown explicitly as "imported transactions awaiting review" (not manual entries, since those no longer queue). Never hidden or folded into totals.
3. Budgets — monthly + any linked Group budgets, with over-budget ones visually flagged
4. Accounts — including the Net Balance treatment from §4
5. People — net due to/from, aggregated per §5
6. Current month + previous 3 months (per original §16), kept to a minimal visual, not a full chart

**Dashboard details (decided in Phase 1):** a prominent "Add transaction" button at the top from 1024px up (on phones and tablets the raised **+** covers it). Net worth and Net balance always include archived accounts; an account can only be archived at a ₹0 balance, so money never silently drops out. Headline numbers (Net worth, this month's surplus) show whole rupees; transaction lists and entries keep paise. Months before the user's first transaction show "—" in the last-4-months table, not ₹0.00.

**Navigation (decided in Phase 1):**
- **Queue** menu item shows the pending count, e.g. "Queue (12)".
- **Edit log** (stored in the audit_history table) lives inside Transactions as a tab ("All transactions" / "Edit log"), plus a "View edit log" link on each transaction. It is not a top-level menu item. It uses plain wording — no accounting jargon; Dr/Cr appears only in the treatment preview — and shows "Imported from <file name> on <date>" for transactions approved from the Queue.
- **Import wording:** "Import" is the menu item; buttons and headings say "Import file". Import history rows expand to per-row outcomes (queued, skipped, flagged) with reasons and show the upload time.
- **Transactions filters (extends original §4 Transaction Explorer):** account, category / income head, event, text search on merchant and description, amount range, and a date range or all dates, with Export CSV of the current filtered view (carries the §8 disclaimer). Each account on the Accounts page opens its own filtered transactions.
- **Accounts:** each account shows its opening balance and "Balance as of" date, editable through the same engine and Edit log.
- **Master data** holds the lists transactions are classified with: expense categories, income heads, events (People and Groups join in Phase 2). The old `/settings` route redirects to it.
- **Settings** is reserved for future user preferences — alerts, backup & restore, plan, profile — and is not built yet.
- **Phones and tablets (below 1024px):** bottom tab bar — Home · Transactions · raised **+** · Queue (count) · More. The **+** offers "Add transaction" and "Import file" (import is the main way data comes in, so it is never more than two taps away). **More** holds Accounts, Import, Master data and Sign out; Accounts is also one tap away via "Manage" on the Dashboard. The top menu appears from 1024px up.

---

## 8. Reports

- Personal insight reports (Net Worth, Income & Expenditure, Cash Flow, Budget & Spending, Money Position, Dashboard) stay fully in scope.
- **Out of scope:** official/statutory use — tax filing, audits, compliance submissions, business bookkeeping (business income stays summary-only per original §11).
- Every report and export carries a disclaimer: *"For personal use only. Not intended for tax, audit, or statutory reporting purposes."*
- Reports show an explicit uncategorised/unreconciled line, not just clean totals — completeness over appearance.
- Filterable by account, category, person, group, event, date range (extends original §4 Transaction Explorer).
- Export to Excel/PDF, respecting whatever filter is currently applied.

---

## 9. Import & Detection

- Statement/template upload auto-detects and pre-fills Queue entries using history-based pattern matching (§3).
- **SMS detection deferred to a future phase** — iOS has no API for reading SMS at all; Android restricts it to default-handler app categories. Fragility (banks change SMS formats without notice) mirrors exactly the bank-sync problems the manual/template-import design was meant to avoid.
- **Email detection is a more viable near-term candidate** than SMS, since it doesn't carry the same OS-level restriction — treat as a separate, independently-prioritized feature, not bundled with SMS.
- Any auto-detection source must respect universal duplicate prevention (§2).

---

## 10. AI Transaction Assistant (new capability)

- Natural-language entry ("Paid 480 to Swiggy for dinner today") parsed by an LLM into the same structured fields as any other entry — lands on the same proposed-treatment card with the same Review & Post button. The AI never posts directly.
- Also supports: conversational bulk categorisation in the Queue, and read-only Q&A over the user's own data ("how much did I spend on dining this month?").
- **Decision needed:** gate as Paid-tier only (recommended — it has real ongoing per-message API cost, unlike most other features, and sending text to a cloud LLM conflicts with Free tier's "data never leaves device" promise unless clearly disclosed).

---

## 11. Storage Architecture

| Tier | Storage | Devices |
|---|---|---|
| **Free** | Local-only, on-device | Single device. Optional encrypted backup to Google Drive/iCloud (user-set passphrase), same model as WhatsApp backups. |
| **Paid** | Cloud (Postgres via Supabase) | Multi-device, synced |

- Both tiers always have a minimal **account record** (phone/email, plan status, expiry) — separate from transaction data, which stays local for Free users.
- **Upgrade (Free → Paid):** existing local data migrates to cloud in a one-time, user-visible action ("Uploading your existing records to the cloud…").
- **Downgrade (Paid → Free):**
  1. Payment stops → grace period begins (recommend 7–14 days), not immediate cutoff.
  2. User selects one device → full encrypted snapshot downloads to it (reusing the same backup encryption mechanism as Free-tier Drive/iCloud backups).
  3. Other devices lose cloud sync access.
  4. Cloud copy is retained, encrypted, for a resubscribe window (decision needed: 30/60/90 days) — instant restore if they resubscribe within it, deleted after (per DPDP data-minimization principle).
  5. **Decision needed:** fallback behavior if the user never picks a device during the grace period (recommended: auto-select most recently active device).
- **Decision needed before Phase 4:** true live multi-device sync vs. simpler "always-fetch-latest-on-open" model — large scope/cost difference, pick deliberately.

---

## 12. Security

- **Row Level Security (RLS)** on every cloud table, enforced at the database level — non-negotiable once multiple paying customers share one database.
- Encryption in transit (TLS) and at rest (AES-256) — standard on Supabase/Neon by default.
- Authentication handled by the platform (Supabase Auth), not custom-built. Primary method: **phone number + OTP** (matches Indian consumer app conventions); email/password as fallback. Optional 2FA.
- No ads, no third-party data-sharing, no analytics SDKs that transmit financial data.
- Minimal data collection on People/Groups (name, maybe contact — nothing more).

**Login flow:** Account layer (phone/email + plan) is always cloud-based and minimal, regardless of tier. Free tier's session token authorizes local-only reads/writes. Paid tier's session token authorizes RLS-scoped Supabase queries, enabling multi-device sync.

**Decision needed:** require login before any use, or let a user try Free mode anonymously and only prompt for account creation when they need backup, a promo code, or to upgrade (recommended, per friction-reduction principle).

---

## 13. Subscription & Billing

- **Payment gateway:** Razorpay (UPI support, India-domestic pricing, Subscriptions product for recurring billing).
- **Free tier:** limited feature set (core transactions, dashboard), local-only storage.
- **Paid tier:** full feature access (Groups, Investments, Loans, Budgets, exports), cloud storage, multi-device, AI assistant.

---

## 14. Admin Panel (internal, not visible to app users)

Separate authentication from the main app entirely.

- **Plans & Pricing:** toggle which features are free vs. paid; edit monthly/annual prices. Changes apply to new/renewing subscriptions only, never retroactively mid-cycle. Logged to audit log.
- **Feature gates:** per-module on/off for Free tier.
- **Timing levers:** grace period days, retention window days — all configurable without a code deploy.
- **Promo codes:** flat ₹ or % discount, validity window, usage limits, assignable to a specific user or public. Redemptions tracked.
- **Audit log:** every admin config change — what changed, before→after value, who, when. Distinct from the user-facing Edit log (stored in the audit_history table; `AuditHistory` in §18 of the original requirements).
- **Sales & Reports:** revenue summary, active subscriber count, GST breakdown (taxable value + 18% collected, per GST 2.0), exportable GST sales register (for GSTR filing) and income summary export.

**Legal note:** GST registration becomes mandatory once aggregate annual turnover crosses ₹20 lakh. Build GST-ready fields (taxable amount, GST amount, invoice number, customer state) into the payments table from day one, even while under threshold — far easier than retrofitting later. As a subscription business processing many customers' personal data, Recordkar (the company) is a Data Fiduciary under India's DPDP Act — get proper legal guidance before charging real subscribers at scale, separate from the "no compliance role" boundary that applies to what the app's *output* is used for by the end user.

---

## 15. Technical Stack

| Layer | Choice |
|---|---|
| Database | Postgres via Supabase (free tier to start; ~500 MB shared across all users, step up to Pro at $25/month when needed) |
| Hosting | Vercel or Netlify (free tier) |
| Payments | Razorpay |
| AI | Claude API (server-side, for the transaction assistant) |
| Client | Web app (PWA) — not native iOS/Android for v1, since iOS development requires a Mac and Android Studio's emulator is heavy for the current dev machine. Native apps are a later-phase decision once there's a working product. |
| Dev tooling | Node.js, Git, VS Code, Claude Code, GitHub |

---

## 16. Build Sequence

| Phase | Covers | Est. duration |
|---|---|---|
| 1 | Core transaction engine, Queue, Dashboard | 4–6 weeks |
| 2 | Groups, People, Settlements, Budgets | 4–5 weeks |
| 3 | Loans, Investments, FD/RD/Chits, imports + auto-categorisation | 5–7 weeks |
| 4 | Local-first storage, cloud sync, multi-device, encrypted backup | 4–6 weeks |
| 5 | Subscription billing, admin panel, GST reports, promo codes | 3–4 weeks |
| 6 | Security hardening (RLS audit), testing, deployment | 3–4 weeks |

**Total estimate:** 6–8 months full-time, solo + Claude Code. Cash cost ~$700–1,100 over that period (dominated by Claude subscription + app store fees), assuming Supabase/Razorpay stay on free/pay-as-you-go tiers through the build.

---

## 17. Screens Not Yet Designed

Not blockers for starting — just not yet mocked up: Loans/EMI screens, Investments screens, FD/RD/Chits screens, first-time onboarding, Settings (preferences: alerts, backup & restore, plan, profile — distinct from Master data), notifications (push/in-app for alerts and reminders), standalone Money Position report, Admin "Timing levers" screen.

---

## 18. Open Decisions Log

Carried forward, unresolved as of this document:

1. Exact-amount split validation: block vs. auto-adjust?
2. Does closing a Group lock its linked Budget?
3. Net-balance-excludes-EMI logic: credit cards only, or all EMI-bearing accounts?
4. Downgrade retention window length: 30 / 60 / 90 days?
5. Downgrade grace-period fallback if user never picks a device?
6. True live multi-device sync vs. latest-snapshot-on-open model?
7. AI assistant: Paid-only, or Free with disclosure?
8. Require login on first app open, or allow anonymous Free trial first?

---

*This document reflects decisions made through the Recordkar planning conversation. The original Rupevo requirements document remains the source-of-truth for anything not explicitly extended or changed here.*
