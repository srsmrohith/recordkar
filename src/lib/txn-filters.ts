// Transactions filters, parsed from the URL (so filtered views can be linked and exported).
import { isValidIsoDate } from "@/lib/engine/treatment";
import { monthStart } from "@/lib/format";

export type DateScope =
  | { mode: "month"; month: string } // YYYY-MM-01
  | { mode: "range"; from: string | null; to: string | null } // inclusive
  | { mode: "all" };

export type TxnFilters = {
  dates: DateScope;
  account: string | null;
  counter: { kind: "category" | "income_head"; id: string } | null;
  event: string | null;
  q: string | null;
  min: number | null;
  max: number | null;
};

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (sp: Params, key: string) => {
  const v = sp[key];
  return typeof v === "string" ? v.trim() : null;
};
const uuid = (v: string | null) => (v && UUID.test(v) ? v : null);
const amount = (v: string | null) => {
  if (!v) return null;
  const n = Number(v.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Search text safe to place in a PostgREST or() filter: drop characters with syntax meaning. */
export function sanitizeSearch(q: string | null): string | null {
  const clean = (q ?? "").replace(/[,()"'\\*%:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return clean || null;
}

export function parseTxnFilters(sp: Params, today: string): TxnFilters {
  const from = one(sp, "from");
  const to = one(sp, "to");
  const month = one(sp, "month");
  let dates: DateScope;
  if (one(sp, "all") === "1") dates = { mode: "all" };
  else if ((from && isValidIsoDate(from)) || (to && isValidIsoDate(to))) {
    const f = from && isValidIsoDate(from) ? from : null;
    const t = to && isValidIsoDate(to) ? to : null;
    // A reversed range is almost always a slip; swap rather than show nothing.
    dates = f && t && f > t ? { mode: "range", from: t, to: f } : { mode: "range", from: f, to: t };
  } else if (month && /^\d{4}-\d{2}$/.test(month) && isValidIsoDate(`${month}-01`)) {
    dates = { mode: "month", month: `${month}-01` };
  } else dates = { mode: "month", month: monthStart(today) };

  const counterRaw = one(sp, "category");
  const [kind, id] = (counterRaw ?? "").split(":");
  const counter =
    (kind === "category" || kind === "income_head") && uuid(id) ? { kind: kind as "category" | "income_head", id: id! } : null;

  let min = amount(one(sp, "min"));
  let max = amount(one(sp, "max"));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  return {
    dates,
    account: uuid(one(sp, "account")),
    counter,
    event: uuid(one(sp, "event")),
    q: sanitizeSearch(one(sp, "q")),
    min,
    max,
  };
}

/** URL query for a filter set (used for month navigation, "clear" links and Export CSV). */
export function filtersToQuery(f: TxnFilters, overrides: Partial<TxnFilters> = {}): string {
  const x = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (x.dates.mode === "all") p.set("all", "1");
  else if (x.dates.mode === "range") {
    if (x.dates.from) p.set("from", x.dates.from);
    if (x.dates.to) p.set("to", x.dates.to);
  } else p.set("month", x.dates.month.slice(0, 7));
  if (x.account) p.set("account", x.account);
  if (x.counter) p.set("category", `${x.counter.kind}:${x.counter.id}`);
  if (x.event) p.set("event", x.event);
  if (x.q) p.set("q", x.q);
  if (x.min !== null) p.set("min", String(x.min));
  if (x.max !== null) p.set("max", String(x.max));
  return p.toString();
}

/** Number of filters in use besides the date scope (for the "Filters (n)" label). */
export function activeFilterCount(f: TxnFilters): number {
  return [f.account, f.counter, f.event, f.q, f.min, f.max].filter((v) => v !== null).length;
}

/** An account's own transactions — every date, both sides of transfers — e.g. from the Accounts page. */
export function accountTransactionsHref(accountId: string): string {
  return `/transactions?${new URLSearchParams({ all: "1", account: accountId })}`;
}
