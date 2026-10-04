import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterData } from "@/lib/engine/types";

/** Accounts, categories, income heads and events, including archived ones (for display of old records). */
export async function loadMaster(supabase: SupabaseClient): Promise<MasterData> {
  const [accounts, categories, incomeHeads, events] = await Promise.all([
    supabase.from("accounts").select("id, name, type, archived").order("name"),
    supabase.from("categories").select("id, name, archived").order("name"),
    supabase.from("income_heads").select("id, name, nature, archived").order("name"),
    supabase.from("events").select("id, name, archived").order("name"),
  ]);
  for (const r of [accounts, categories, incomeHeads, events]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    accounts: accounts.data!,
    categories: categories.data!,
    incomeHeads: incomeHeads.data!,
    events: events.data!,
  };
}

/** Turn Postgres errors from the posting RPCs into messages a user can act on. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("transaction_references")) {
    return "A transaction with this reference already exists for this account.";
  }
  if (error.code === "23505") return "That name is already in use.";
  if (error.code === "23514") return "The entry doesn't balance or breaks an accounting rule, so it wasn't posted.";
  if (error.code === "P0001" || error.code === "P0002") return error.message;
  return `Something went wrong: ${error.message}`;
}
