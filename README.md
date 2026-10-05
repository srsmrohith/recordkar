# Recordkar

Know where your money stands. Personal financial operating system — see `recordkar-requirements.md`
(product spec), `rupevo-original-requirements.md` (original requirements) and `docs/phase1-decisions.md`.

## Phase 1 status
Core transaction engine (double-entry, Dr = Cr enforced in the database), manual entry with inline
Review & Post, CSV template import → Queue review (inline edit, duplicate flags, bulk approve), Dashboard.

## Setup
1. `.env.local` (git-ignored):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   ```
   The app never uses the secret key.
2. Run each file in `supabase/migrations/` once, in filename order, in the Supabase SQL Editor:
   `20261004000000_phase1_core.sql`, `20261005000000_more_default_categories.sql`,
   `20261005000100_import_row_outcomes.sql`. To give an existing account the default categories added on
   2026-10-05, run `supabase/snippets/add-new-default-categories.sql` with its email filled in.
3. Supabase → Authentication → URL Configuration: set **Site URL** to `http://localhost:3000` and add
   `http://localhost:3000/auth/callback` to **Redirect URLs**. (Add your deployed URLs here later.)
   Sign-in uses Supabase's default magic-link email — no template changes or custom SMTP needed.
   Open the link in the same browser you requested it from.
4. `npm install`, then `npm run dev` and open http://localhost:3000.

Later: custom SMTP + typed sign-in codes (see `docs/phase1-decisions.md`). Supabase's built-in email
sender is rate-limited to a few emails per hour — fine for development.

## Scripts
`npm run dev` · `npm run build` · `npm test` (engine unit tests) · `npm run typecheck` · `npm run lint`

## Layout
- `src/lib/engine/` — framework-free accounting engine: treatment rules, validation, CSV parsing, duplicate matching
- `src/app/(app)/` — signed-in pages: Dashboard, Transactions (with Edit log tab), Accounts, Queue, Import, Master data
- `supabase/migrations/` — schema, RLS, posting RPCs, Edit log (stored in the audit_history table)
