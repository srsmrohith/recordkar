**RUPEVO**

**Personal Financial Operating System**

**User-Provided Requirements ****&**** Product Notes**

*Pure source record — no project status or architecture recommendations*

# 1. Scope

This document records only product requirements, feature details, workflows, accounting treatments, examples, terminology and other details provided by the user for Rupevo. It intentionally excludes present project status and architecture recommendations.

| **Item** | **User-provided detail** |
| --- | --- |
| Product | Rupevo |
| Concept | Personal Financial Operating System (PFO) |
| Google Sheet | PFO_DB_DEV |
| Apps Script project | PFO_DEV |
| Product principle | Simple for the user, sophisticated backend. |

# 2. Core Model

External Transaction → Internal Transaction → Accounting Components

# Transaction workflow

Detect

Identify

Classify

Ask for Missing Required Inputs

Validate

Show Proposed Accounting Treatment

User Approval

Post

Reconcile

Never use “Detect → Guess → Post.”

The application should ask for missing required information. Approval should remain disabled until required information is complete. Questions should be dynamic by transaction type.

# Transaction rules

One external bank/card transaction can have multiple accounting components.

External references are separate from internal Transaction IDs.

Duplicate prevention is required.

Transactions should participate in accounting, reconciliation, cash flow and net worth as applicable.

# 3. Import Requirements

| **Input** | **Meaning** |
| --- | --- |
| Bank Statement | Evidence of what the bank reported. |
| Rupevo Excel Template | Structured user-provided financial input. |

Both use the same controlled processing pipeline while retaining their different source meanings.

# Required import workflow

Excel Template → Upload → Import Validation → Input / External Transaction → Duplicate Check

Transaction Queue → Missing Information → Classification → Proposed Treatment → Approval

Transaction → Accounting Components → Reconciliation

Uploaded template data must not bypass validation or approval or create duplicate transactions.

| **Excel Template Column** | **Detail** |
| --- | --- |
| Transaction Date | Required |
| Value Date | Value date |
| Account | Required |
| Transaction Type | Required |
| Amount | Required |
| Debit/Credit | Required |
| Category | Category |
| Description | Description |
| Merchant | Merchant |
| Person | Person |
| Group | Group |
| Event | Event |
| Reference | Reference |
| Notes | Notes |

# Template requirements

Instructions sheet

Transactions sheet

Lists sheet

Transaction types: EXPENSE, INCOME, TRANSFER, REFUND, ADJUSTMENT, OTHER

Debit/Credit values: DEBIT and CREDIT

Accounts, Categories, People, Groups and Events should be available for selection.

# 4. Earlier Spreadsheet Concepts

# Input areas

Master Data

Income Input

Expense Input

Ledger Input

EMI Tracker

# Master data

Accounts

Income categories

Expense categories

Ledger heads

Friends/family/brokers in ledger-related data

# Expense split

Split With

Lakshman's Share

Dilip's Share

Your Share

Full expense amount hits the account once; splitting must not double-count.

# Ledger examples

Friend loans

Repayments

SIP contributions

Dhan transfers

Upstox transfers

# Outputs

Accounts Summary

FY Summary

Bank Reconciliation

Net Worth

Friends & Investment Summary

Dashboard

Transaction Explorer

# Transaction Explorer

Bank account

Expense category

Income category

Ledger head

Start date

End date

Opening balance

Closing balance

# 5. Recurring Fixed Expenses

# Requirements

Recurring amount

Day of month

Effective From

Later changes apply only to future dates by adding a new row with a later effective date.

Recurring fixed expenses should support reminders.

# 6. Loans & EMI

# Requirements

Loan tracking

EMI tracking

Principal/interest separation

Automatic installment posting

Account-balance impact

Remaining tenure

Receivables

Status

GST/tax component for card EMIs where applicable.

| **Loan example** | **User-provided detail** |
| --- | --- |
| Loan amount | ₹18 lakh |
| EMI | ₹20,459 |
| Initial interest rate | 11% |
| Later interest rate | 11.85% based on repo-rate changes |
| Reconstruction | 55 EMIs: date, estimated interest, estimated principal, cumulative principal, expected outstanding |
| Investigation | Identify source of ₹15,395 closing negative balance and whether principal outstanding is correct or there is an accounting discrepancy. |

# 7. People, Ledger & Groups

# Requirements

People master data

Personal Ledger

Groups

Settlements

Simple 1:1 lending/borrowing does not require a Group.

Group expense splitting must avoid double-counting the original cash/card transaction.

# 8. Events / Occasional Spending

# Requirements

Occasional/event spending is context/attribute, not the primary accounting category.

Event transactions remain in accounting, reconciliation, cash flow, net worth and cumulative surplus.

They can be excluded from normal budget/trend analysis.

# 9. Investments

# Requirements

Stocks

Mutual Funds

Bonds

Other Investments

Purchases

Sales

Quantity

Cost

Fees

Current value

Realized gains/losses

Unrealized gains/losses

Dividends

# 10. Fixed Deposits, Recurring Deposits & Chits

# Requirements

Fixed Deposits have dedicated structures.

Recurring Deposits have dedicated structures.

Chit funds are separate and agreement-specific.

# 11. Income

# Requirements

Active income should be distinguishable from passive income.

Business income should initially be a summary rather than a full business ERP.

# 12. Insurance & Recurring Obligations

# Requirements

Insurance tracking

Insurance reminders

Recurring obligations

Recurring fixed expense changes using future effective dates.

# 13. Budgets, Spending & Insights

# Requirements

Budgets by spending head

Historical average

Spending pace

Configurable alerts

Recurring fixed-expense detection and reminders

Cumulative surplus/deficit

# 14. Money Position / Where Is My Money?

# Requirements

Explain the user's money position.

Show unreconciled differences.

Do not automatically call an unreconciled difference missing money/error.

# 15. Reports

# Reports named by the user

Income & Expenditure account

Balance Sheet

Net Worth

Ledgers

Insights on expenses

Cash Flow

Budget & Spending

Account / Ledger

Money Position

# 16. Dashboard

# Dashboard information

Current month

Previous three months

Account balances

Income/expenditure information

Financial summaries and insights

# 17. Reconciliation

# Requirements

Upload bank statements

Match bank statement transactions

Mark matched transactions

Identify unreconciled differences

Maintain distinction between external evidence and internal accounting

# 18. Named Database Entities / Tables

# Names provided

Config

Accounts

People

Groups

Categories

IncomeHeads

Events

Transactions

AccountingComponents

TransactionReferences

TransactionQueue

Loans

LoanPayments

Investments

InvestmentTransactions

FixedDeposits

RecurringDeposits

Chits

Insurance

RecurringObligations

Budgets

Reconciliation

AuditHistory

ImportBatches

ExternalTransactions

# 19. Product Navigation Names

| **Top level** | **Submodules** |
| --- | --- |
| Dashboard | Dashboard |
| Money | Overview; Transactions; Accounts; Transfers |
| People | People; Personal Ledger; Groups; Settlements |
| Commitments | Loans & EMI; Recurring Expenses; Insurance |
| Investments | Overview; Mutual Funds; Stocks; Bonds; Other Investments |
| Reports | Income & Expenses; Cash Flow; Net Worth; Budget & Spending; Account / Ledger; Money Position |
| Imports | Import Template; Bank Statements; Imported Transactions; Import History |
| Reconciliation | Reconciliation |
| Backup & Restore | Backup & Restore |
| Settings | Settings |

| **Imports area** | **Items** |
| --- | --- |
| Import Template | Download Excel Template; Upload Completed Template; Import Validation |
| Bank Statements | Upload CSV; Upload XLSX; Statement Mapping |
| Imported Transactions | Imported transactions for review |
| Import History | Previous import batches and processing status |

# 20. Future Features Mentioned

# Additional requirements/ideas

Detect transactions from SMS or email.

Create a queue for the user to map detected entries.

Compare transactions to avoid duplication.

Bank statement upload and reconciliation.

Insurance tracking reminders.

Recurring fixed-expense detection and reminders.

AI-assisted transaction classification.

External integrations.

# 21. Accounting Treatment Examples

| **Scenario** | **User-provided treatment** |
| --- | --- |
| Salary received | Bank credit is income linked to salary income head. |
| Expense | Full bank/card transaction is recorded once under the applicable expense category. |
| Friend split | Full expense amount hits the account once; other people's shares are represented without double-counting the original movement. |
| Friend repayment | Personal receivable is reduced; principal repayment is not treated as ordinary income. |
| Transfer | Movement between owned accounts is not income or expense. |
| Loan EMI | EMI is separated into principal and interest; principal reduces liability and interest is expense. |
| Investment purchase | Cash decreases and investment holding increases; cost and fees are tracked. |
| Investment sale | Holding decreases; realized gain/loss is tracked. |
| Event spending | Remains in accounting/reconciliation/cash flow/net worth/cumulative surplus, with event context. |
| Unreconciled difference | Displayed as an unreconciled difference, not automatically labeled missing money/error. |

# 22. Product Principles Explicitly Provided

# Principles

Simple frontend, sophisticated backend.

Do not guess and post.

Ask for missing required information.

Approval requires required information to be complete.

Show proposed accounting treatment before posting.

User approval is required before posting.

Prevent duplicate transactions.

External source evidence and internal accounting records are distinct.

Occasional/event context does not replace accounting categories.

Unreconciled differences should not automatically be treated as missing money/error.

# 23. Information Excluded From This Reference

# Excluded by request

Present project status

Completed/in-progress/pending phase status

Architecture recommendations

Technology-stack recommendations

Commercialization recommendations

Pricing recommendations

Current implementation/error assessment

Independent product analysis

# 24. Source Boundary

This is a pure record of details provided by the user in the Rupevo discussions. It does not add new architecture, implementation, status, or product recommendations.

Rupevo • User-Provided Requirements & Product Notes • v1.0