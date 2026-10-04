import type { Metadata } from "next";
import { loadMaster } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { MasterList } from "./master-list";

export const metadata: Metadata = { title: "Master data" };

export default async function MasterDataPage() {
  const { supabase } = await requireUser();
  const master = await loadMaster(supabase);
  const withArchived = <T extends { archived?: boolean }>(l: T[]) => l.map((x) => ({ ...x, archived: Boolean(x.archived) }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Master data</h1>
      <p className="text-sm text-ink-2">
        The lists you choose from when recording transactions. Archived items stay on past transactions but can&apos;t be chosen for new ones.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <MasterList kind="categories" title="Expense categories" items={withArchived(master.categories)} />
        <MasterList
          kind="income_heads"
          title="Income heads"
          hint="Active income is earned from work; passive income comes from assets."
          items={withArchived(master.incomeHeads)}
        />
        <MasterList
          kind="events"
          title="Events / occasions"
          hint="A tag for occasional spending (e.g. Diwali, Goa trip). It doesn't replace the category."
          items={withArchived(master.events)}
        />
      </div>
    </div>
  );
}
