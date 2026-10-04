-- Recordkar Phase 1: core transaction engine, Queue, Dashboard.
-- See docs/phase1-decisions.md for the decisions this schema encodes.
--
-- Write model:
--   * Master data (accounts, categories, income_heads, events) and the import/queue tables
--     are written directly by the signed-in user under RLS.
--   * transactions, accounting_components, transaction_references and audit_history are
--     READ-ONLY to clients. They are written only through the security-definer RPCs below,
--     so every posting is balance-checked and every change lands in audit_history.
--   * Composite foreign keys (x_id, user_id) guarantee a row can only reference the same
--     user's master data, even inside security-definer functions.

-- ===========================================================================
-- Types
-- ===========================================================================
create type public.account_type as enum ('bank', 'cash', 'credit_card', 'wallet');
create type public.txn_type as enum ('EXPENSE', 'INCOME', 'TRANSFER', 'REFUND', 'ADJUSTMENT', 'OTHER', 'OPENING_BALANCE');
-- Statement direction: DEBIT = money out of / charged to the account; CREDIT = money in.
create type public.txn_direction as enum ('DEBIT', 'CREDIT');
create type public.entry_side as enum ('DR', 'CR');
create type public.system_head as enum ('opening_balance', 'balance_adjustment');
create type public.income_nature as enum ('active', 'passive');
create type public.txn_source as enum ('manual', 'csv', 'system');
create type public.queue_status as enum ('pending', 'posted', 'discarded');

-- ===========================================================================
-- Master data
-- ===========================================================================
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  type public.account_type not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index accounts_user_name_key on public.accounts (user_id, lower(btrim(name)));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index categories_user_name_key on public.categories (user_id, lower(btrim(name)));

create table public.income_heads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  nature public.income_nature not null default 'active',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index income_heads_user_name_key on public.income_heads (user_id, lower(btrim(name)));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index events_user_name_key on public.events (user_id, lower(btrim(name)));

-- ===========================================================================
-- Internal transactions + accounting components
-- ===========================================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  txn_date date not null,
  value_date date,
  type public.txn_type not null,
  direction public.txn_direction not null,
  amount numeric(14, 2) not null check (amount > 0),
  account_id uuid not null,
  -- Exactly one counter side (see transactions_one_counter).
  counter_account_id uuid,
  category_id uuid,
  income_head_id uuid,
  counter_system_head public.system_head,
  merchant text,
  description text,
  event_id uuid,
  notes text,
  source public.txn_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (counter_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (income_head_id, user_id) references public.income_heads (id, user_id),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete set null (event_id),
  constraint transactions_one_counter
    check (num_nonnulls(counter_account_id, category_id, income_head_id, counter_system_head) = 1),
  constraint transactions_transfer_distinct
    check (counter_account_id is distinct from account_id),
  constraint transactions_type_rules check (
    case type
      when 'EXPENSE' then category_id is not null and direction = 'DEBIT'
      when 'INCOME' then income_head_id is not null and direction = 'CREDIT'
      when 'TRANSFER' then counter_account_id is not null
      when 'REFUND' then category_id is not null and direction = 'CREDIT'
      when 'ADJUSTMENT' then counter_system_head = 'balance_adjustment'
      when 'OPENING_BALANCE' then counter_system_head = 'opening_balance'
      when 'OTHER' then counter_system_head is null
    end
  )
);
create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_dup_lookup_idx on public.transactions (user_id, account_id, amount, txn_date);

create table public.accounting_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  side public.entry_side not null,
  amount numeric(14, 2) not null check (amount > 0),
  account_id uuid,
  category_id uuid,
  income_head_id uuid,
  system_head public.system_head,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (income_head_id, user_id) references public.income_heads (id, user_id),
  constraint accounting_components_one_head
    check (num_nonnulls(account_id, category_id, income_head_id, system_head) = 1)
);
create index accounting_components_txn_idx on public.accounting_components (transaction_id);
create index accounting_components_account_idx on public.accounting_components (user_id, account_id);

-- Double-entry integrity (Recordkar §2): checked at commit, after all components are written.
create function public.check_transaction_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn uuid;
  v_amount numeric;
  v_dr numeric;
  v_cr numeric;
  v_count int;
begin
  if tg_table_name = 'transactions' then
    v_txn := new.id;
  else
    v_txn := coalesce(new.transaction_id, old.transaction_id);
  end if;

  select amount into v_amount from public.transactions where id = v_txn;
  if not found then
    return null; -- transaction deleted in the same commit
  end if;

  select coalesce(sum(amount) filter (where side = 'DR'), 0),
         coalesce(sum(amount) filter (where side = 'CR'), 0),
         count(*)
    into v_dr, v_cr, v_count
    from public.accounting_components
   where transaction_id = v_txn;

  if v_count < 2 or v_dr <> v_cr or v_dr <> v_amount then
    raise exception 'Transaction % is not balanced (Dr %, Cr %, amount %)', v_txn, v_dr, v_cr, v_amount
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger transactions_balanced
  after insert or update on public.transactions
  deferrable initially deferred
  for each row execute function public.check_transaction_balanced();

create constraint trigger accounting_components_balanced
  after insert or update or delete on public.accounting_components
  deferrable initially deferred
  for each row execute function public.check_transaction_balanced();

-- External references are separate from internal transaction IDs (Rupevo §2).
create table public.transaction_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  account_id uuid not null,
  reference text not null check (length(btrim(reference)) > 0),
  source public.txn_source not null,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id)
);
-- Same account + same reference = the same real-world transaction.
create unique index transaction_references_unique
  on public.transaction_references (user_id, account_id, lower(btrim(reference)));

-- ===========================================================================
-- Import + Queue
-- ===========================================================================
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  total_rows int not null default 0,
  queued_rows int not null default 0,
  skipped_duplicate_rows int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- Raw evidence exactly as uploaded. Never edited.
create table public.external_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_batch_id uuid not null,
  row_number int not null,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete cascade
);

create table public.transaction_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_batch_id uuid not null,
  external_transaction_id uuid not null,
  -- Proposed values; any may be missing until the user fills them on the Queue card.
  txn_date date,
  value_date date,
  type public.txn_type check (type is distinct from 'OPENING_BALANCE'),
  direction public.txn_direction,
  amount numeric(14, 2) check (amount is null or amount > 0),
  account_id uuid,
  counter_account_id uuid,
  category_id uuid,
  income_head_id uuid,
  counter_system_head public.system_head,
  merchant text,
  description text,
  event_id uuid,
  notes text,
  reference text,
  -- People/Groups arrive in Phase 2; CSV values are preserved as text until then.
  person_text text,
  group_text text,
  -- Import-time problems keyed by field, e.g. {"account": "No account named 'HDFC Savngs'"}.
  issues jsonb not null default '{}'::jsonb,
  duplicate_of_transaction_id uuid,
  duplicate_of_queue_id uuid,
  duplicate_reviewed boolean not null default false,
  status public.queue_status not null default 'pending',
  posted_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete cascade,
  foreign key (external_transaction_id, user_id) references public.external_transactions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (counter_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (income_head_id, user_id) references public.income_heads (id, user_id),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete set null (event_id),
  foreign key (duplicate_of_transaction_id, user_id)
    references public.transactions (id, user_id) on delete set null (duplicate_of_transaction_id),
  foreign key (duplicate_of_queue_id, user_id)
    references public.transaction_queue (id, user_id) on delete set null (duplicate_of_queue_id),
  foreign key (posted_transaction_id, user_id)
    references public.transactions (id, user_id) on delete set null (posted_transaction_id)
);
create index transaction_queue_user_status_idx on public.transaction_queue (user_id, status, txn_date);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transaction_queue_touch before update on public.transaction_queue
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Audit history (user data). Append-only.
-- ===========================================================================
create table public.audit_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  before jsonb,
  after jsonb,
  changed_at timestamptz not null default now()
);
create index audit_history_entity_idx on public.audit_history (user_id, entity, entity_id, changed_at desc);

-- Row-level audit for master data and queue decisions.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_history (user_id, entity, entity_id, action, before, after)
  values (
    coalesce(new.user_id, old.user_id),
    tg_argv[0],
    coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger accounts_audit after insert or update or delete on public.accounts
  for each row execute function public.audit_row_change('account');
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row_change('category');
create trigger income_heads_audit after insert or update or delete on public.income_heads
  for each row execute function public.audit_row_change('income_head');
create trigger events_audit after insert or update or delete on public.events
  for each row execute function public.audit_row_change('event');
create trigger transaction_queue_audit after update on public.transaction_queue
  for each row when (old.status is distinct from new.status)
  execute function public.audit_row_change('queue_item');

-- ===========================================================================
-- Posting RPCs (the only way to write transactions)
-- ===========================================================================

-- Snapshot of a transaction with its components, for audit before/after values.
create function public.txn_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(t) || jsonb_build_object(
    'components',
    coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.side desc, c.id)
                from public.accounting_components c
               where c.transaction_id = t.id), '[]'::jsonb),
    'references',
    coalesce((select jsonb_agg(r.reference order by r.created_at)
                from public.transaction_references r
               where r.transaction_id = t.id), '[]'::jsonb))
  from public.transactions t
  where t.id = p_id
$$;

create function public.write_components(p_txn_id uuid, p_user uuid, p_components jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_components) <> 'array' then
    raise exception 'components must be an array' using errcode = '22023';
  end if;
  insert into public.accounting_components
    (user_id, transaction_id, side, amount, account_id, category_id, income_head_id, system_head)
  select p_user,
         p_txn_id,
         (c ->> 'side')::public.entry_side,
         (c ->> 'amount')::numeric,
         (c ->> 'account_id')::uuid,
         (c ->> 'category_id')::uuid,
         (c ->> 'income_head_id')::uuid,
         (c ->> 'system_head')::public.system_head
    from jsonb_array_elements(p_components) c;
end;
$$;

create function public.write_reference(p_txn_id uuid, p_user uuid, p_txn jsonb, p_batch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_txn ->> 'reference'), '') is not null then
    insert into public.transaction_references (user_id, transaction_id, account_id, reference, source, import_batch_id)
    values (p_user, p_txn_id, (p_txn ->> 'account_id')::uuid, btrim(p_txn ->> 'reference'),
            coalesce(p_txn ->> 'source', 'manual')::public.txn_source, p_batch);
  end if;
end;
$$;

-- Post a new transaction. p_queue_id marks the originating Queue item as posted in the same commit.
create function public.post_transaction(p_txn jsonb, p_components jsonb, p_queue_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_batch uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  insert into public.transactions (
    id, user_id, txn_date, value_date, type, direction, amount, account_id,
    counter_account_id, category_id, income_head_id, counter_system_head,
    merchant, description, event_id, notes, source)
  values (
    coalesce((p_txn ->> 'id')::uuid, gen_random_uuid()),
    v_user,
    (p_txn ->> 'txn_date')::date,
    (p_txn ->> 'value_date')::date,
    (p_txn ->> 'type')::public.txn_type,
    (p_txn ->> 'direction')::public.txn_direction,
    (p_txn ->> 'amount')::numeric,
    (p_txn ->> 'account_id')::uuid,
    (p_txn ->> 'counter_account_id')::uuid,
    (p_txn ->> 'category_id')::uuid,
    (p_txn ->> 'income_head_id')::uuid,
    (p_txn ->> 'counter_system_head')::public.system_head,
    nullif(btrim(p_txn ->> 'merchant'), ''),
    nullif(btrim(p_txn ->> 'description'), ''),
    (p_txn ->> 'event_id')::uuid,
    nullif(btrim(p_txn ->> 'notes'), ''),
    coalesce(p_txn ->> 'source', 'manual')::public.txn_source)
  returning id into v_id;

  perform public.write_components(v_id, v_user, p_components);

  if p_queue_id is not null then
    update public.transaction_queue
       set status = 'posted', posted_transaction_id = v_id
     where id = p_queue_id and user_id = v_user and status = 'pending'
    returning import_batch_id into v_batch;
    if not found then
      raise exception 'Queue item is no longer pending' using errcode = 'P0001';
    end if;
  end if;

  perform public.write_reference(v_id, v_user, p_txn, v_batch);

  insert into public.audit_history (user_id, entity, entity_id, action, after)
  values (v_user, 'transaction', v_id, 'create', public.txn_snapshot(v_id));

  return v_id;
end;
$$;

-- Edit a posted transaction: replaces its fields and components, logs before/after.
create function public.update_transaction(p_id uuid, p_txn jsonb, p_components jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before jsonb;
  v_source public.txn_source;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select source into v_source from public.transactions where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  v_before := public.txn_snapshot(p_id);

  update public.transactions set
    txn_date = (p_txn ->> 'txn_date')::date,
    value_date = (p_txn ->> 'value_date')::date,
    type = (p_txn ->> 'type')::public.txn_type,
    direction = (p_txn ->> 'direction')::public.txn_direction,
    amount = (p_txn ->> 'amount')::numeric,
    account_id = (p_txn ->> 'account_id')::uuid,
    counter_account_id = (p_txn ->> 'counter_account_id')::uuid,
    category_id = (p_txn ->> 'category_id')::uuid,
    income_head_id = (p_txn ->> 'income_head_id')::uuid,
    counter_system_head = (p_txn ->> 'counter_system_head')::public.system_head,
    merchant = nullif(btrim(p_txn ->> 'merchant'), ''),
    description = nullif(btrim(p_txn ->> 'description'), ''),
    event_id = (p_txn ->> 'event_id')::uuid,
    notes = nullif(btrim(p_txn ->> 'notes'), ''),
    updated_at = now()
  where id = p_id and user_id = v_user;

  delete from public.accounting_components where transaction_id = p_id;
  perform public.write_components(p_id, v_user, p_components);

  delete from public.transaction_references where transaction_id = p_id;
  perform public.write_reference(p_id, v_user, p_txn || jsonb_build_object('source', v_source), null);

  insert into public.audit_history (user_id, entity, entity_id, action, before, after)
  values (v_user, 'transaction', p_id, 'update', v_before, public.txn_snapshot(p_id));
end;
$$;

create function public.delete_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before jsonb;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform 1 from public.transactions where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  v_before := public.txn_snapshot(p_id);
  delete from public.transactions where id = p_id and user_id = v_user;
  insert into public.audit_history (user_id, entity, entity_id, action, before)
  values (v_user, 'transaction', p_id, 'delete', v_before);
end;
$$;

-- Create an account and (optionally) its Opening Balance entry in one commit.
create function public.create_account(p_account jsonb, p_opening_txn jsonb default null, p_opening_components jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.accounts (id, user_id, name, type)
  values (coalesce((p_account ->> 'id')::uuid, gen_random_uuid()), v_user,
          btrim(p_account ->> 'name'), (p_account ->> 'type')::public.account_type)
  returning id into v_id;

  if p_opening_txn is not null then
    perform public.post_transaction(p_opening_txn, p_opening_components, null);
  end if;
  return v_id;
end;
$$;

-- ===========================================================================
-- Default master data for new users
-- ===========================================================================
create function public.seed_default_master_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name)
  select p_user, n
    from unnest(array['Food & Dining', 'Groceries', 'Rent', 'Utilities', 'Transport', 'Shopping',
                      'Health', 'Entertainment', 'Education', 'Travel', 'Bank Charges']) as n
  on conflict do nothing;

  insert into public.income_heads (user_id, name, nature)
  values (p_user, 'Salary', 'active'),
         (p_user, 'Business', 'active'),
         (p_user, 'Interest', 'passive'),
         (p_user, 'Dividends', 'passive'),
         (p_user, 'Rental', 'passive'),
         (p_user, 'Other', 'active')
  on conflict do nothing;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_master_data(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this migration ran.
select public.seed_default_master_data(u.id)
  from auth.users u
 where not exists (select 1 from public.categories c where c.user_id = u.id);

-- ===========================================================================
-- Reporting views (security_invoker: RLS of the caller applies)
-- ===========================================================================

-- balance: money held for bank/cash/wallet; outstanding owed for credit cards.
create view public.account_balances with (security_invoker = true) as
select a.id,
       a.user_id,
       a.name,
       a.type,
       a.archived,
       a.created_at,
       case when a.type = 'credit_card' then -1 else 1 end
         * coalesce(sum(case when c.side = 'DR' then c.amount else -c.amount end), 0) as balance
  from public.accounts a
  left join public.accounting_components c on c.account_id = a.id
 group by a.id;

-- Per-month income, expense and balance adjustments (adjustments are excluded from surplus).
create view public.monthly_summary with (security_invoker = true) as
select t.user_id,
       date_trunc('month', t.txn_date::timestamp)::date as month,
       coalesce(sum(case when c.income_head_id is not null
                         then case when c.side = 'CR' then c.amount else -c.amount end end), 0) as income,
       coalesce(sum(case when c.category_id is not null
                         then case when c.side = 'DR' then c.amount else -c.amount end end), 0) as expense,
       coalesce(sum(case when c.system_head = 'balance_adjustment'
                         then case when c.side = 'CR' then c.amount else -c.amount end end), 0) as adjustments
  from public.transactions t
  join public.accounting_components c on c.transaction_id = t.id
 group by t.user_id, date_trunc('month', t.txn_date::timestamp);

-- ===========================================================================
-- Row Level Security + grants
-- ===========================================================================
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.income_heads enable row level security;
alter table public.events enable row level security;
alter table public.transactions enable row level security;
alter table public.accounting_components enable row level security;
alter table public.transaction_references enable row level security;
alter table public.import_batches enable row level security;
alter table public.external_transactions enable row level security;
alter table public.transaction_queue enable row level security;
alter table public.audit_history enable row level security;

-- Master data: read/create/update own rows. No hard deletes (archive instead), except events.
create policy accounts_select on public.accounts for select to authenticated using (user_id = (select auth.uid()));
create policy accounts_insert on public.accounts for insert to authenticated with check (user_id = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy categories_select on public.categories for select to authenticated using (user_id = (select auth.uid()));
create policy categories_insert on public.categories for insert to authenticated with check (user_id = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy income_heads_select on public.income_heads for select to authenticated using (user_id = (select auth.uid()));
create policy income_heads_insert on public.income_heads for insert to authenticated with check (user_id = (select auth.uid()));
create policy income_heads_update on public.income_heads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy events_select on public.events for select to authenticated using (user_id = (select auth.uid()));
create policy events_insert on public.events for insert to authenticated with check (user_id = (select auth.uid()));
create policy events_update on public.events for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ledger tables: read-only to clients; written via RPCs.
create policy transactions_select on public.transactions for select to authenticated using (user_id = (select auth.uid()));
create policy accounting_components_select on public.accounting_components for select to authenticated using (user_id = (select auth.uid()));
create policy transaction_references_select on public.transaction_references for select to authenticated using (user_id = (select auth.uid()));
create policy audit_history_select on public.audit_history for select to authenticated using (user_id = (select auth.uid()));

-- Import evidence: insert + read.
create policy import_batches_select on public.import_batches for select to authenticated using (user_id = (select auth.uid()));
create policy import_batches_insert on public.import_batches for insert to authenticated with check (user_id = (select auth.uid()));
create policy import_batches_update on public.import_batches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy external_transactions_select on public.external_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy external_transactions_insert on public.external_transactions for insert to authenticated with check (user_id = (select auth.uid()));

-- Queue: read, create (import), edit inline (review). Discard = status change, never delete.
create policy transaction_queue_select on public.transaction_queue for select to authenticated using (user_id = (select auth.uid()));
create policy transaction_queue_insert on public.transaction_queue for insert to authenticated with check (user_id = (select auth.uid()));
create policy transaction_queue_update on public.transaction_queue for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Table privileges: anon gets nothing; ledger tables are select-only.
revoke all on public.accounts, public.categories, public.income_heads, public.events,
              public.transactions, public.accounting_components, public.transaction_references,
              public.import_batches, public.external_transactions, public.transaction_queue,
              public.audit_history, public.account_balances, public.monthly_summary
  from anon, authenticated;
grant select, insert, update on public.accounts, public.categories, public.income_heads, public.events,
                                public.import_batches, public.transaction_queue to authenticated;
grant select, insert on public.external_transactions to authenticated;
grant select on public.transactions, public.accounting_components, public.transaction_references,
                public.audit_history, public.account_balances, public.monthly_summary to authenticated;

-- Functions: only the public RPCs are callable, and only by signed-in users.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.post_transaction(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.update_transaction(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.delete_transaction(uuid) to authenticated;
grant execute on function public.create_account(jsonb, jsonb, jsonb) to authenticated;
