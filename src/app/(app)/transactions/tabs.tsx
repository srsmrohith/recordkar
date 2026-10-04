import Link from "next/link";

const TABS = [
  { key: "list", href: "/transactions", label: "All transactions" },
  { key: "edit-log", href: "/transactions/edit-log", label: "Edit log" },
] as const;

/** Sub-navigation for the Transactions area. The Edit log lives here, not in the main menu. */
export function TransactionsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Transactions" className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            t.key === active ? "border-brand font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
