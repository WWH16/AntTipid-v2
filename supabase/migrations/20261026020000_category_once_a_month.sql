-- Paid once a month ----------------------------------------------------------------------------------
-- A spending category paid in one go each month (rent, tuition, a bill). The spending pace leaves it out, so one
-- big payment doesn't read as spending fast; until it's paid, its category budget is set aside instead.
alter table public.categories
  add column once_a_month boolean not null default false,
  add check (not once_a_month or kind = 'expense');
