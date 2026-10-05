-- Opening balance date = the start of an account's records (the balance before that day's transactions).
--
-- A transaction counts only if its date is on or after the opening balance date of EVERY account it
-- touches (both legs of a transfer). Uncounted transactions are excluded whole — account side and
-- category/income side — from balances and monthly figures, so everything stays balanced. Nothing is
-- stored or deleted: this is decided at calculation time, so moving an opening date earlier brings
-- transactions back automatically.
--
-- Manual entries and edits dated before an account's opening date are blocked (RK001). Imported rows
-- (source = 'csv') may still be approved; they are stored but not counted. Future dates are blocked
-- for every posting (RK002).

-- Each account's opening balance date (accounts without an opening balance have no start).
create view public.account_starts with (security_invoker = true) as
select user_id, account_id, min(txn_date) as start_date
  from public.transactions
 where type = 'OPENING_BALANCE'
 group by user_id, account_id;

-- Transactions that count: none of the accounts their components touch starts after their date.
create view public.counted_transactions with (security_invoker = true) as
select t.*
  from public.transactions t
 where not exists (
   select 1
     from public.accounting_components c
     join public.account_starts s on s.account_id = c.account_id
    where c.transaction_id = t.id
      and t.txn_date < s.start_date
 );

-- Same columns as before; only counted transactions contribute.
create or replace view public.account_balances with (security_invoker = true) as
select a.id,
       a.user_id,
       a.name,
       a.type,
       a.archived,
       a.created_at,
       case when a.type = 'credit_card' then -1 else 1 end
         * coalesce(sum(case when c.side = 'DR' then c.amount else -c.amount end), 0) as balance
  from public.accounts a
  left join (
    select c.*
      from public.accounting_components c
      join public.counted_transactions ct on ct.id = c.transaction_id
  ) c on c.account_id = a.id
 group by a.id;

create or replace view public.monthly_summary with (security_invoker = true) as
select t.user_id,
       date_trunc('month', t.txn_date::timestamp)::date as month,
       coalesce(sum(case when c.income_head_id is not null
                         then case when c.side = 'CR' then c.amount else -c.amount end end), 0) as income,
       coalesce(sum(case when c.category_id is not null
                         then case when c.side = 'DR' then c.amount else -c.amount end end), 0) as expense,
       coalesce(sum(case when c.system_head = 'balance_adjustment'
                         then case when c.side = 'CR' then c.amount else -c.amount end end), 0) as adjustments
  from public.counted_transactions t
  join public.accounting_components c on c.transaction_id = t.id
 group by t.user_id, date_trunc('month', t.txn_date::timestamp);

revoke all on public.account_starts, public.counted_transactions from anon, authenticated;
grant select on public.account_starts, public.counted_transactions to authenticated;

-- Block future dates everywhere, and manual entries / edits before an account's opening date.
create function public.enforce_transaction_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_account uuid;
  v_start date;
  v_name text;
begin
  if new.txn_date > v_today then
    raise exception 'Date can''t be in the future'
      using errcode = 'RK002', detail = json_build_object('today', v_today)::text;
  end if;

  -- An opening balance defines the start; it is never before itself.
  if new.type = 'OPENING_BALANCE' then
    return new;
  end if;
  -- Imported rows may be approved before the opening date: stored, but not counted.
  if tg_op = 'INSERT' and new.source = 'csv' then
    return new;
  end if;

  foreach v_account in array array_remove(array[new.account_id, new.counter_account_id], null) loop
    select min(txn_date) into v_start
      from public.transactions
     where account_id = v_account and type = 'OPENING_BALANCE' and id <> new.id;
    if v_start is not null and new.txn_date < v_start then
      select name into v_name from public.accounts where id = v_account;
      raise exception '% records start on % (its opening balance date)', v_name, v_start
        using errcode = 'RK001',
              detail = json_build_object('account_id', v_account, 'account_name', v_name, 'opening_date', v_start)::text;
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.enforce_transaction_dates() from public, anon, authenticated;

create trigger transactions_enforce_dates
  before insert or update on public.transactions
  for each row execute function public.enforce_transaction_dates();
