-- Unusual purchases: "It's normal" -------------------------------------------------------------------
-- A purchase the K-means check flagged as unusual (DSS feature 9) that the user says is normal: it's no longer
-- flagged, and the pace counts it like any other. Goes with its transaction.
create table public.anomaly_dismissals (
  -- One per transaction; the key also serves the cascade from transactions and the lookup by transaction.
  transaction_id uuid primary key references public.transactions (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);

alter table public.anomaly_dismissals enable row level security;
revoke all on public.anomaly_dismissals from anon;
grant select, insert, delete on public.anomaly_dismissals to authenticated;
-- Own rows only, and only for the user's own transactions.
create policy "own rows" on public.anomaly_dismissals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid()))
  );
