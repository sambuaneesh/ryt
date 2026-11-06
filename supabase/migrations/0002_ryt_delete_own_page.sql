-- RYT: let people delete their own page (Settings -> Profile -> Delete my page).
-- Deleting a profile removes their ryts and notes with it (foreign keys cascade); ryts they
-- SENT stay with the people who got them, without a link back. The Google login itself
-- (auth.users) is shared with other apps in this project and is left alone.
--
-- Additive only, safe to run twice. Run in the Supabase SQL editor.

do $$ begin
  create policy ryt_profiles_delete_own on public.ryt_profiles for delete to authenticated using (id = auth.uid());
exception when duplicate_object then null; end $$;
