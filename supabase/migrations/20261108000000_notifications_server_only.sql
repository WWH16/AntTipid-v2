-- Users could write notifications through the Supabase REST API, and any row still waiting for email went out on their
-- next save: text and links of their choosing, sent from the app's Gmail, as often as they liked. Now only the API's own
-- connection writes them (backend/notify.py); users can read their own and mark them read. Apply after the backend
-- that writes them that way is live.
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
