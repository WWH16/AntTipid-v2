-- The audit log keeps what was added or deleted, and names a wallet or category instead of its id, as it was called at
-- the time. Entries written before this stay as they were: nothing rewrites the log.

-- A logged value as the user knows it. Falls back to the id if the row is already gone.
create function public.audit_value(col text, val jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when col in ('wallet_id', 'to_wallet_id') then coalesce((select to_jsonb(name) from public.wallets where id = (val #>> '{}')::uuid), val)
    when col = 'category_id' then coalesce((select to_jsonb(name) from public.categories where id = (val #>> '{}')::uuid), val)
    else val
  end
$$;
revoke execute on function public.audit_value(text, jsonb) from public, anon, authenticated;

create or replace function public.write_audit_log()
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
    select jsonb_object_agg(k, jsonb_build_array(public.audit_value(k, prev -> k), public.audit_value(k, cur -> k))) into v_diff
    from jsonb_object_keys(cur) as k
    where k <> 'created_at' and prev -> k is distinct from cur -> k;
    if v_diff is null then
      return null;  -- saved with nothing changed
    end if;
  else
    -- Added or deleted: what it held, as [null, value] or [value, null]. The label already has its name (and a budget's
    -- category); what's left out says nothing a reader would look for.
    select jsonb_object_agg(k, case tg_op
      when 'INSERT' then jsonb_build_array(null::jsonb, public.audit_value(k, v))
      else jsonb_build_array(public.audit_value(k, v), null::jsonb)
    end) into v_diff
    from jsonb_each(cur) as e(k, v)
    where k not in ('id', 'user_id', 'created_at', 'name', 'title', 'icon', 'source')
      and v not in ('null', '""', 'false')
      and not (tg_argv[0] = 'budget' and k = 'category_id');
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
