-- Record why an uploaded row was skipped, so Import history can show per-row outcomes with reasons.
-- Rows imported before this migration keep skip_reason = null ("reason not recorded").
alter table public.external_transactions
  add column skip_reason text check (skip_reason in ('in_file', 'already_recorded'));
