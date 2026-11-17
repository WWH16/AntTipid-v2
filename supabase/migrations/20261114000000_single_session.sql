-- One place at a time: a new session (a sign-in on another browser or device) ends the account's other sessions.
-- Their refresh tokens go with them (foreign key cascade), and the API refuses their access tokens (auth.py), so the
-- old device is signed out at once. Tabs in one browser share a session, so the app keeps those to one tab itself.
create function public.end_other_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Two sign-ins at the same moment would each miss the other's uncommitted session, so they take turns per user.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  delete from auth.sessions where user_id = new.user_id and id <> new.id;
  return null;
exception when others then
  raise warning 'end_other_sessions: %', sqlerrm;
  return null;  -- never stop someone signing in
end $$;
revoke execute on function public.end_other_sessions() from public, anon, authenticated;

create trigger on_session_created_end_others after insert on auth.sessions
  for each row execute function public.end_other_sessions();
