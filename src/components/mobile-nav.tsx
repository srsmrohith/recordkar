"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";

/**
 * Phone/tablet navigation (below 1024px): Home · Transactions · + · Queue · More.
 * "+" opens a sheet with Add transaction / Import file, so both are two taps from anywhere.
 * "More" holds Accounts, Import, Master data and Sign out. (Settings will join it when built.)
 */
export function MobileNav({ pendingCount, email }: { pendingCount: number; email: string | null }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<"add" | "more" | null>(null);

  // Close any open sheet after navigating.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setSheet(null);
  }

  const moreActive = ["/accounts", "/import", "/master-data"].some((p) => pathname.startsWith(p));

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          <Tab href="/" label="Home" active={pathname === "/"} icon={<HomeIcon />} />
          <Tab href="/transactions" label="Transactions" active={pathname.startsWith("/transactions")} icon={<ListIcon />} />
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="Add"
              aria-haspopup="dialog"
              aria-expanded={sheet === "add"}
              onClick={() => setSheet("add")}
              className="-mt-5 mb-1.5 flex size-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg ring-4 ring-surface transition active:scale-95"
            >
              <PlusIcon />
            </button>
          </div>
          <Tab
            href="/queue"
            label="Queue"
            active={pathname.startsWith("/queue")}
            icon={<InboxIcon />}
            badge={pendingCount}
          />
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheet === "more"}
            onClick={() => setSheet("more")}
            className={`flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] ${moreActive ? "font-semibold text-brand" : "text-ink-2"}`}
          >
            <MoreIcon />
            More
          </button>
        </div>
      </nav>

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add">
        <SheetLink href="/transactions/new" title="Add transaction" hint="Record one transaction now" icon={<PlusIcon small />} />
        <SheetLink href="/import" title="Import file" hint="Upload the CSV template — rows go to the Queue for review" icon={<UploadIcon />} />
      </Sheet>

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="More">
        <SheetLink href="/accounts" title="Accounts" icon={<WalletIcon />} />
        <SheetLink href="/import" title="Import" icon={<UploadIcon />} />
        <SheetLink href="/master-data" title="Master data" hint="Categories, income heads, events" icon={<TagIcon />} />
        <div className="mt-2 flex items-center gap-3 border-t border-border px-2 pt-3">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{email}</span>
          <form action={signOut}>
            <button className="btn-secondary text-sm">Sign out</button>
          </form>
        </div>
      </Sheet>
    </>
  );
}

function Tab({ href, label, icon, active, badge = 0 }: { href: string; label: string; icon: ReactNode; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} awaiting review` : undefined}
      className={`relative flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] ${active ? "font-semibold text-brand" : "text-ink-2"}`}
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white tabular">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}

/** Bottom sheet built on <dialog> (focus trap, Esc to close). Tapping the backdrop closes it. */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 lg:hidden"
    >
      <div className="mx-auto max-w-lg rounded-t-2xl border border-border bg-surface px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <div className="mb-1 flex items-center justify-between px-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-1">{children}</div>
      </div>
    </dialog>
  );
}

function SheetLink({ href, title, hint, icon }: { href: string; title: string; hint?: string; icon: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface-2 active:bg-surface-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </Link>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}
function PlusIcon({ small = false }: { small?: boolean }) {
  return (
    <svg {...iconProps} width={small ? 20 : 26} height={small ? 20 : 26} strokeWidth={2.2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg {...iconProps} width={20} height={20}>
      <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg {...iconProps} width={20} height={20}>
      <path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg {...iconProps} width={20} height={20}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01" />
    </svg>
  );
}
