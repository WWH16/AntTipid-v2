-- Budget history ---------------------------------------------------------------------------------------
-- The limit each budget had per month, so a finished month is read against the budgets it ended with, not today's.
-- A row is the limit from that month on (null: removed that month); a month without a row keeps the one before.
-- Written only by the trigger below, on every budget save or delete. Several edits in one month: the last one wins.
-- No foreign key on category_id: a category's delete cascades to its budget, whose trigger then writes here.
create table public.budget_history (
  user_id      uuid not null references auth.users (id) on delete cascade,
  category_id  uuid,                    -- null is the overall monthly budget, as in budgets
  month        date not null,           -- first day of the month
  limit_amount numeric(14, 2),
  unique nulls not distinct (user_id, category_id, month)
);

alter table public.budget_history enable row level security;
revoke all on public.budget_history from anon;
grant select on public.budget_history to authenticated;
create policy "own rows" on public.budget_history for select to authenticated using (user_id = (select auth.uid()));

-- Budgets set before history began count as set from always: past months read them, as they did before.
insert into public.budget_history (user_id, category_id, month, limit_amount)
select user_id, category_id, date '2000-01-01', limit_amount from public.budgets;

create function public.record_budget_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The user's calendar month, as the API counts it (APP_TIMEZONE in the backend).
  this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
  -- The old budget is gone (deleted, or moved to another category): it ends this month. Skipped when the whole user
  -- is being deleted, since the row would point at a user that no longer exists.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.category_id is distinct from new.category_id) then
    if exists (select 1 from auth.users where id = old.user_id) then
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
revoke execute on function public.record_budget_history() from public, anon, authenticated;

create trigger on_budget_change_record_history
  after insert or update of category_id, limit_amount or delete on public.budgets
  for each row execute function public.record_budget_history();
