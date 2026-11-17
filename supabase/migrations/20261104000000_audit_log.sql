-- Audit log: who changed what and when. Written only by the triggers below, so every write path is covered,
-- including direct Supabase clients. Users can read their own rows and nothing else.
create table public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in ('create', 'update', 'delete', 'sign_in', 'restore')),
  entity     text not null check (entity in ('transaction', 'wallet', 'category', 'budget', 'account')),
  entity_id  uuid,                      -- no foreign key: the row it names may be gone
  label      text not null default '',  -- its name at the time, so a deleted row still reads
  changes    jsonb,                     -- updates only: {"amount": [250, 300]}
  created_at timestamptz not null default now()
);
create index audit_log_user_idx on public.audit_log (user_id, id desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy "own rows" on public.audit_log for select to authenticated using (user_id = (select auth.uid()));

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  prev jsonb := case tg_op when 'UPDATE' then to_jsonb(old) end;
  v_diff jsonb;
begin
  -- A restore writes one entry of its own instead of one per row (backend/backup.py).
  if current_setting('anttipid.restoring', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_array(prev -> k, cur -> k)) into v_diff
    from jsonb_object_keys(cur) as k
    where k <> 'created_at' and prev -> k is distinct from cur -> k;
    if v_diff is null then
      return null;  -- saved with nothing changed
    end if;
  end if;
  insert into public.audit_log (user_id, action, entity, entity_id, label, changes)
  values (
    (cur ->> 'user_id')::uuid,
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    tg_argv[0],
    (cur ->> 'id')::uuid,
    case
      when tg_argv[0] = 'budget' and cur ->> 'category_id' is null then 'Monthly budget'
      when tg_argv[0] = 'budget' then coalesce((select name from public.categories where id = (cur ->> 'category_id')::uuid), '')
      else coalesce(cur ->> 'title', cur ->> 'name', '')
    end,
    v_diff
  );
  return null;
end $$;
revoke execute on function public.write_audit_log() from public, anon, authenticated;

-- pg_trigger_depth() = 0: only changes made directly. Seeded categories and cascades are not entries of their own.
create trigger audit_transactions after insert or update or delete on public.transactions
  for each row when (pg_trigger_depth() = 0) execute function public.write_audit_log('transaction');
create trigger audit_wallets after insert or update or delete on public.wallets
  for each row when (pg_trigger_depth() = 0) execute function public.write_audit_log('wallet');
create trigger audit_categories after insert or update or delete on public.categories
  for each row when (pg_trigger_depth() = 0) execute function public.write_audit_log('category');
create trigger audit_budgets after insert or update or delete on public.budgets
  for each row when (pg_trigger_depth() = 0) execute function public.write_audit_log('budget');

-- A new auth session is a sign-in. A token refresh updates the row, so it adds nothing.
create function public.audit_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (user_id, action, entity) values (new.user_id, 'sign_in', 'account');
  return null;
exception when others then
  return null;  -- a log line must never stop someone signing in
end $$;
revoke execute on function public.audit_sign_in() from public, anon, authenticated;

create trigger on_session_created_audit after insert on auth.sessions
  for each row execute function public.audit_sign_in();
