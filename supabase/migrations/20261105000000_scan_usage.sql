-- Receipt scans per user per day, so one account can't spend the free model quota. Only the API's own connection touches
-- this (backend/main.py). Signed-in users get no access, or they could reset their count through the Supabase REST API.
create table public.scan_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day     date not null,
  used    integer not null default 1
);

alter table public.scan_usage enable row level security;
revoke all on public.scan_usage from anon, authenticated;
