import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The sign-up seed lives in SQL; check the latest definition of seed_default_master_data().
const dir = join(process.cwd(), "supabase", "migrations");
const latestSeed = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .filter((sql) => /function public\.seed_default_master_data/.test(sql))
  .at(-1)!;
const categories = [...latestSeed.match(/unnest\(array\[([\s\S]*?)\]\)/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe("default expense categories for new users", () => {
  it("includes the added categories", () => {
    for (const name of ["Miscellaneous", "Insurance", "Fuel", "Subscriptions", "Gifts & Donations", "Household", "Personal care", "Taxes & fees"]) {
      expect(categories).toContain(name);
    }
  });

  it("keeps the original ones", () => {
    for (const name of ["Food & Dining", "Groceries", "Rent", "Utilities", "Transport", "Shopping", "Health", "Entertainment", "Education", "Travel", "Bank Charges"]) {
      expect(categories).toContain(name);
    }
  });

  it("has no EMI category and no duplicates", () => {
    expect(categories.some((c) => /\bemi\b/i.test(c))).toBe(false);
    expect(new Set(categories.map((c) => c.toLowerCase())).size).toBe(categories.length);
  });
});
