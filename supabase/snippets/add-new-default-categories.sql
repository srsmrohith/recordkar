-- Add the 2026-10-05 default expense categories to an EXISTING account.
-- Run once in the Supabase SQL Editor after replacing the email. Categories the account already has
-- (same name, any case) are skipped, so it is safe to run more than once.
insert into public.categories (user_id, name)
select u.id, n
  from auth.users u
  cross join unnest(array[
    'Miscellaneous', 'Insurance', 'Fuel', 'Subscriptions',
    'Gifts & Donations', 'Household', 'Personal care', 'Taxes & fees'
  ]) as n
 where u.email = 'you@example.com'
on conflict do nothing;
