-- Notifications: what the bell lists and what gets emailed. The API writes rows inside the save that caused them.
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,  -- once per key, ever: near:{budget}:{YYYY-MM}, unusual:{transaction_id} and so on
  kind       text not null check (kind in ('near', 'used', 'over', 'run_out', 'unusual', 'new_month')),
  title      text not null,
  body       text not null default '',
  link       text not null,  -- an app path
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  emailed_at timestamptz,    -- null: still to be emailed
  unique (user_id, key)
);
create index notifications_user_idx on public.notifications (user_id, id desc);
create index notifications_unsent_idx on public.notifications (user_id) where emailed_at is null;

-- A missing row means everything is on.
create table public.notification_settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  near_limit    boolean not null default true,
  over_limit    boolean not null default true,
  run_out       boolean not null default true,
  unusual       boolean not null default true,
  new_month     boolean not null default true,
  test_email_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;
