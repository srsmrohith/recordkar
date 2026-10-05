-- More default expense categories for new users.
-- Replaces seed_default_master_data(); existing users are not changed by this migration.
-- (EMI is deliberately not a category: EMIs are split into principal and interest by the Loans module.)

create or replace function public.seed_default_master_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name)
  select p_user, n
    from unnest(array[
      'Food & Dining', 'Groceries', 'Rent', 'Utilities', 'Transport', 'Fuel', 'Shopping', 'Household',
      'Health', 'Personal care', 'Insurance', 'Entertainment', 'Subscriptions', 'Education', 'Travel',
      'Gifts & Donations', 'Bank Charges', 'Taxes & fees', 'Miscellaneous'
    ]) as n
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

-- Keep it callable only by the sign-up trigger (create or replace keeps grants, but be explicit).
revoke execute on function public.seed_default_master_data(uuid) from public, anon, authenticated;
