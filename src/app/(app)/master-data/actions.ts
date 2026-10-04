"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";

export type MasterKind = "categories" | "income_heads" | "events";
const KINDS: MasterKind[] = ["categories", "income_heads", "events"];

export type MasterState = { error?: string; ok?: number };

export async function addMasterItem(kind: MasterKind, _: MasterState, form: FormData): Promise<MasterState> {
  if (!KINDS.includes(kind)) return { error: "Unknown list." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };
  const row: Record<string, string> = { name };
  if (kind === "income_heads") row.nature = form.get("nature") === "passive" ? "passive" : "active";

  const { supabase } = await requireUser();
  const { error } = await supabase.from(kind).insert(row);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: Date.now() };
}

export async function updateMasterItem(kind: MasterKind, id: string, patch: { name?: string; archived?: boolean; nature?: "active" | "passive" }) {
  if (!KINDS.includes(kind)) throw new Error("Unknown list.");
  const clean: typeof patch = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error("Name can't be empty.");
    clean.name = patch.name.trim();
  }
  if (patch.archived !== undefined) clean.archived = patch.archived;
  if (patch.nature !== undefined && kind === "income_heads") clean.nature = patch.nature;

  const { supabase } = await requireUser();
  const { error } = await supabase.from(kind).update(clean).eq("id", id);
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/", "layout");
}
