import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await requireUser();
  const { count } = await supabase
    .from("transaction_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="min-h-screen pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="sticky top-0 z-20 h-[57px] border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-4 px-4">
          <Link href="/" aria-label="Recordkar home">
            <Wordmark />
          </Link>
          {/* Top menu from 1024px up; below that the bottom tab bar takes over. */}
          <div className="hidden flex-1 lg:block">
            <Nav pendingCount={count ?? 0} />
          </div>
          <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex">
            <span className="hidden max-w-40 truncate text-xs text-ink-3 xl:inline">{user.email}</span>
            <form action={signOut}>
              <button className="btn-ghost text-xs">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <MobileNav pendingCount={count ?? 0} email={user.email ?? null} />
    </div>
  );
}
