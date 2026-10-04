"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "Settings" is reserved for future preferences (alerts, backup, plan, profile); categories,
// income heads and events are Master data. The Edit log is a tab inside Transactions.
const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/queue", label: "Queue" },
  { href: "/import", label: "Import" },
  { href: "/master-data", label: "Master data" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ pendingCount, variant }: { pendingCount: number; variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const items = variant === "bottom" ? ITEMS.filter((i) => i.href !== "/import") : ITEMS;

  return (
    <nav aria-label="Main" className={variant === "top" ? "flex gap-1" : "grid grid-cols-5"}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const label = item.href === "/queue" && pendingCount > 0 ? `${item.label} (${pendingCount})` : item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              variant === "top"
                ? `rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`
                : `flex flex-col items-center py-2.5 text-[11px] ${active ? "font-semibold text-brand" : "text-ink-2"}`
            }
          >
            <span className={item.href === "/queue" && pendingCount > 0 ? "tabular font-medium text-warn-ink" : undefined}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
