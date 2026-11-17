-- Budget history, follow-up ---------------------------------------------------------------------------
-- 1. A category's history goes with the category, like its budget does. Safe to cascade: a category can only be
--    deleted when no transaction uses it (transactions has no cascade), so its history never held any spending.
-- 2. Budgets copied in when history began start from the month they were created, not from always.

-- Rows of categories already deleted, so the foreign key can be added.
delete from public.budget_history h
where h.category_id is not null
  and not exists (select 1 from public.categories c where c.id = h.category_id and c.user_id = h.user_id);

alter table public.budget_history
  add foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade;

-- The copied-in rows (month 2000-01-01) move to their budget's creation month. Where that month already has a row
-- (the budget was edited since), the later row already says what the month ended with, so the copy goes.
delete from public.budget_history h
using public.budgets b
where h.month = date '2000-01-01'
  and b.user_id = h.user_id and b.category_id is not distinct from h.category_id
  and exists (
    select 1 from public.budget_history later
    where later.user_id = h.user_id and later.category_id is not distinct from h.category_id
      and later.month = date_trunc('month', b.created_at at time zone 'Asia/Manila')::date
  );
update public.budget_history h
set month = date_trunc('month', b.created_at at time zone 'Asia/Manila')::date
from public.budgets b
where h.month = date '2000-01-01'
  and b.user_id = h.user_id and b.category_id is not distinct from h.category_id;
-- A copied-in budget deleted since has no creation date left: it keeps 2000-01-01.

create or replace function public.record_budget_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The user's calendar month. Keep the zone in step with APP_TIMEZONE in backend/.env: the API and this trigger
  -- must agree on which month an edit lands in.
  this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
  -- The old budget is gone (deleted, or moved to another category): it ends this month. Skipped when its user or
  -- category is itself being deleted: their cascade removes the history too, and the row would point at nothing.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.category_id is distinct from new.category_id) then
    if exists (select 1 from auth.users where id = old.user_id)
       and (old.category_id is null or exists (select 1 from public.categories where id = old.category_id)) then
      insert into public.budget_history (user_id, category_id, month, limit_amount)
      values (old.user_id, old.category_id, this_month, null)
      on conflict (user_id, category_id, month) do update set limit_amount = null;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.budget_history (user_id, category_id, month, limit_amount)
    values (new.user_id, new.category_id, this_month, new.limit_amount)
    on conflict (user_id, category_id, month) do update set limit_amount = excluded.limit_amount;
  end if;
  return null;
end $$;
