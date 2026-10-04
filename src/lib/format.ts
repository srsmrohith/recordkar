// All dates are calendar dates in India time (the app is INR / India-only).
export const APP_TIME_ZONE = "Asia/Kolkata";

const inrFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function inr(value: number | string | null | undefined): string {
  return inrFormat.format(Number(value ?? 0));
}

const inrWholeFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Whole rupees, for dashboard headline figures only. Lists and entries keep paise via `inr`. */
export function inrWhole(value: number | string | null | undefined): string {
  return inrWholeFormat.format(Number(value ?? 0));
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The calendar date (YYYY-MM-DD) of a timestamp in India time. */
export function isoDateInIndia(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date(timestamp));
}

/** A timestamp in India time, e.g. "04 Oct 2026, 4:35 pm". */
export function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-IN", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** First day of the month containing `iso`, offset by `delta` months. */
export function monthStart(iso: string, delta = 0): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

export function monthLabel(iso: string, style: "short" | "long" = "short"): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: style, year: "numeric", timeZone: "UTC" });
}

export const ACCOUNT_TYPE_LABELS = {
  bank: "Bank",
  cash: "Cash",
  credit_card: "Credit card",
  wallet: "Wallet",
} as const;

export const TXN_TYPE_LABELS = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
  OTHER: "Other",
  OPENING_BALANCE: "Opening balance",
} as const;
