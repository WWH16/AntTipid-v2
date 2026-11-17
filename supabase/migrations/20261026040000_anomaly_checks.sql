-- Unusual purchases: verdicts and decisions -----------------------------------------------------------
-- Replaces anomaly_dismissals. Each spending purchase is judged once, when it's saved, against the history before it
-- (DSS feature 9), and the verdict is kept: a later purchase can never rewrite it. An unusual one carries the user's
-- decision: one-off (left out of the pace, never teaches the habits) or normal (part of the habits); none yet means
-- it waits for review. The usual range is kept as it was when judged.
create table public.anomaly_checks (
  -- One per transaction; the key also serves the cascade from transactions and the lookup by transaction.
  transaction_id uuid primary key references public.transactions (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  unusual        boolean not null,
  decision       text check (decision in ('one_off', 'normal')),
  method         text check (method in ('kmeans', 'simple', 'none')),
  usual_low      numeric(14, 2),
  usual_high     numeric(14, 2),
  checked_at     timestamptz not null default now(),
  check (decision is null or unusual)
);

alter table public.anomaly_checks enable row level security;
revoke all on public.anomaly_checks from anon;
grant select, insert, update, delete on public.anomaly_checks to authenticated;
-- Own rows only, and only for the user's own transactions.
create policy "own rows" on public.anomaly_checks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid()))
  );

-- "It's normal" from the first version carries over as a normal decision; its range wasn't kept.
insert into public.anomaly_checks (transaction_id, user_id, unusual, decision)
select transaction_id, user_id, true, 'normal' from public.anomaly_dismissals;
drop table public.anomaly_dismissals;
