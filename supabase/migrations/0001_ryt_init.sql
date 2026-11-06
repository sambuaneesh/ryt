-- RYT (Recommend You This): initial schema.
--
-- This Supabase project is SHARED with other apps. This file only ADDS objects, all named
-- ryt_*; it never alters, drops or writes anything that isn't RYT's. Safe to run twice.
-- Run it in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Access model (the site is static, so the database enforces every rule):
--   ryt_profiles        public to read; you edit only your own.
--   ryt_recs            only the page owner can read/edit their inbox directly.
--   ryt_rec_notes       private notes, owner only.
--   ryt_public_recs     view: what a public page shows (verdicts, credit only if allowed).
--   ryt_send()          the only way to send a ryt (checks the owner's inbox setting).
--   ryt_my_sent()       your sent ryts; the outcome only once it's public.

-- ---------------------------------------------------------------------------- profiles
create table if not exists public.ryt_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      text not null check (handle ~ '^[a-z0-9_]{2,24}$'),
  name        text not null check (char_length(name) between 1 and 60),
  bio         text not null default '' check (char_length(bio) <= 280),
  avatar_url  text check (avatar_url is null or avatar_url ~ '^https://'),
  inbox       text not null default 'anyone' check (inbox in ('anyone', 'accounts', 'closed')),
  theme       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create unique index if not exists ryt_profiles_handle_key on public.ryt_profiles (lower(handle));

alter table public.ryt_profiles enable row level security;

do $$ begin
  create policy ryt_profiles_read on public.ryt_profiles for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_profiles_insert_own on public.ryt_profiles for insert to authenticated with check (id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_profiles_update_own on public.ryt_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------- ryts
create table if not exists public.ryt_recs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.ryt_profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  category     text not null default 'other' check (char_length(category) <= 24),
  link         text check (link is null or link ~ '^https?://'),
  cover_url    text check (cover_url is null or cover_url ~ '^https://'),   -- images are links, never uploads
  pitch        text not null default '' check (char_length(pitch) <= 500),
  tags         text[] not null default '{}',
  sender_id    uuid references auth.users (id) on delete set null,          -- null when sent anonymously
  sender_name  text not null default '' check (char_length(sender_name) <= 60),
  show_sender  boolean not null default true,                               -- the sender's choice
  status       text not null default 'new' check (status in ('new', 'up_next', 'tried', 'already_done', 'passed')),
  rating       smallint check (rating between 0 and 10),
  review       text not null default '' check (char_length(review) <= 1000),
  hidden       boolean not null default false,
  manual       boolean not null default false,                              -- added by the owner
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists ryt_recs_owner_idx on public.ryt_recs (owner_id, created_at desc);
create index if not exists ryt_recs_sender_idx on public.ryt_recs (sender_id) where sender_id is not null;

alter table public.ryt_recs enable row level security;

-- The owner manages their inbox. Nobody inserts directly: sending goes through ryt_send(),
-- except the owner adding something themselves.
do $$ begin
  create policy ryt_recs_owner_read on public.ryt_recs for select to authenticated using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_recs_owner_update on public.ryt_recs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_recs_owner_delete on public.ryt_recs for delete to authenticated using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_recs_owner_add on public.ryt_recs for insert to authenticated with check (owner_id = auth.uid() and manual);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------- private notes
create table if not exists public.ryt_rec_notes (
  rec_id    uuid primary key references public.ryt_recs (id) on delete cascade,
  owner_id  uuid not null references public.ryt_profiles (id) on delete cascade,
  note      text not null default '' check (char_length(note) <= 2000)
);
alter table public.ryt_rec_notes enable row level security;
do $$ begin
  create policy ryt_rec_notes_owner on public.ryt_rec_notes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------- public page
-- Only verdicts (tried / already there) that aren't hidden; the sender's name only when they
-- chose to show it, and never anything that could link an anonymous sender.
create or replace view public.ryt_public_recs as
select r.id, r.owner_id, p.handle as owner_handle, r.title, r.category, r.link, r.cover_url, r.pitch, r.tags,
       r.status, r.rating, r.review, r.created_at, r.decided_at,
       case when r.show_sender then nullif(r.sender_name, '') end as sender_name,
       case when r.show_sender then sp.handle end as sender_handle
from public.ryt_recs r
join public.ryt_profiles p on p.id = r.owner_id
left join public.ryt_profiles sp on sp.id = r.sender_id
where r.status in ('tried', 'already_done') and not r.hidden;

grant select on public.ryt_public_recs to anon, authenticated;

-- ---------------------------------------------------------------------------- sending
create or replace function public.ryt_send(
  p_handle text, p_title text, p_category text default 'other', p_link text default null,
  p_cover_url text default null, p_pitch text default '', p_sender_name text default '',
  p_show_sender boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner public.ryt_profiles;
  v_sender uuid := auth.uid();
  v_name text := btrim(coalesce(p_sender_name, ''));
  v_id uuid;
begin
  select * into v_owner from public.ryt_profiles where lower(handle) = lower(p_handle);
  if v_owner.id is null then raise exception 'No page called @%', p_handle using errcode = 'P0002'; end if;
  if v_owner.inbox = 'closed' then raise exception '@% isn''t taking ryts right now', v_owner.handle using errcode = 'P0001'; end if;
  if v_owner.inbox = 'accounts' and v_sender is null then raise exception 'Sign in to send @% a ryt', v_owner.handle using errcode = 'P0001'; end if;
  if v_sender = v_owner.id then raise exception 'Add it to your own list from your inbox instead' using errcode = 'P0001'; end if;
  -- Signed-in senders are credited by their own name.
  if v_sender is not null then select name into v_name from public.ryt_profiles where id = v_sender; end if;
  -- A light brake on floods: at most 30 ryts an hour into one inbox.
  if (select count(*) from public.ryt_recs where owner_id = v_owner.id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'This inbox is busy, try again later' using errcode = 'P0001';
  end if;
  insert into public.ryt_recs (owner_id, title, category, link, cover_url, pitch, sender_id, sender_name, show_sender)
  values (v_owner.id, btrim(p_title), lower(btrim(coalesce(p_category, 'other'))), nullif(btrim(p_link), ''), nullif(btrim(p_cover_url), ''),
          btrim(coalesce(p_pitch, '')), v_sender, coalesce(v_name, ''), coalesce(p_show_sender, true))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.ryt_send(text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.ryt_send(text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------- sent page
-- What you sent, and how it landed once the verdict is public.
create or replace function public.ryt_my_sent()
returns table (id uuid, to_handle text, to_name text, title text, category text, created_at timestamptz,
               landed boolean, status text, rating smallint)
language sql security definer set search_path = public stable as $$
  select r.id, p.handle, p.name, r.title, r.category, r.created_at,
         (r.status in ('tried', 'already_done') and not r.hidden) as landed,
         case when r.status in ('tried', 'already_done') and not r.hidden then r.status end,
         case when r.status in ('tried', 'already_done') and not r.hidden then r.rating end
  from public.ryt_recs r join public.ryt_profiles p on p.id = r.owner_id
  where r.sender_id = auth.uid()
  order by r.created_at desc
$$;

revoke all on function public.ryt_my_sent() from public;
grant execute on function public.ryt_my_sent() to authenticated;
