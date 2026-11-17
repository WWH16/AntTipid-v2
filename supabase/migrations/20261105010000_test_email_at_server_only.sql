-- test_email_at limits test emails, so users must not write it: through the Supabase REST API they could clear it and
-- send as many as they like. The API's own connection sets it (backend/notify_routes.py). A column revoke can't narrow a
-- table grant, so the table grants go first. Apply after the backend that uses that connection is live.
revoke insert, update on public.notification_settings from authenticated;
grant insert (user_id, email_enabled, near_limit, over_limit, run_out, unusual, new_month),
      update (email_enabled, near_limit, over_limit, run_out, unusual, new_month)
  on public.notification_settings to authenticated;
