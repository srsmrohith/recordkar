"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Desktop top menu (1024px and up); phones and tablets use MobileNav.
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

export function Nav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex gap-1">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const pending = item.href === "/queue" && pendingCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {item.label}
            {pending && <span className="tabular font-medium text-warn-ink"> ({pendingCount})</span>}
          </Link>
        );
      })}
    </nav>
  );
}
