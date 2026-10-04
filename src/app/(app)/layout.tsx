import Link from "next/link";
import { Wordmark } from "@/components/logo";
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
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" aria-label="Recordkar home">
            <Wordmark />
          </Link>
          <div className="hidden flex-1 md:block">
            <Nav pendingCount={count ?? 0} variant="top" />
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden max-w-40 truncate text-xs text-ink-3 sm:inline">{user.email}</span>
            <form action={signOut}>
              <button className="btn-ghost text-xs">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <Nav pendingCount={count ?? 0} variant="bottom" />
      </div>
    </div>
  );
}
