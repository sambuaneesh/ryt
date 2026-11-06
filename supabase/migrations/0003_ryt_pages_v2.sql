-- RYT v2: richer pages. Additive only, ryt_* objects only, safe to run twice.
-- Run in the Supabase SQL editor after 0001 (and 0002).
--
--   ryt_recs      + trying / progress   ("Now trying": shown on the page while you try it)
--                 + pinned              (kept at the top of your page)
--                 + extra               (your own fields, e.g. {"Where I watched": "PVR"})
--                 + ask_id              (the request it answers)
--   ryt_lists     your lists ("Monsoon reading"), public
--   ryt_asks      your requests ("I need a good thriller"), public; people answer by recommending
--   ryt_reactions counts of 🔥 👀 🙌 😂 on verdicts; anyone can add one (ryt_react)
--   ryt_public_recs  now also shows what you're trying, plus the new fields and reactions
--   ryt_answer()  recommend something in answer to a request

-- ---------------------------------------------------------------- recommendations: new fields
alter table public.ryt_recs add column if not exists trying   boolean not null default false;
alter table public.ryt_recs add column if not exists progress text not null default '';
alter table public.ryt_recs add column if not exists pinned   boolean not null default false;
alter table public.ryt_recs add column if not exists extra    jsonb not null default '{}'::jsonb;
alter table public.ryt_recs add column if not exists ask_id   uuid;

do $$ begin
  alter table public.ryt_recs add constraint ryt_recs_progress_len check (char_length(progress) <= 60);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ryt_recs add constraint ryt_recs_extra_size check (pg_column_size(extra) <= 2000);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- lists
create table if not exists public.ryt_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.ryt_profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 280),
  items       uuid[] not null default '{}' check (cardinality(items) <= 100),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ryt_lists_owner_idx on public.ryt_lists (owner_id, position);
alter table public.ryt_lists enable row level security;
do $$ begin
  create policy ryt_lists_read on public.ryt_lists for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_lists_owner on public.ryt_lists for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- asks (requests)
create table if not exists public.ryt_asks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.ryt_profiles (id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 200),
  open        boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists ryt_asks_owner_idx on public.ryt_asks (owner_id, created_at desc);
alter table public.ryt_asks enable row level security;
do $$ begin
  create policy ryt_asks_read on public.ryt_asks for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ryt_asks_owner on public.ryt_asks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- reactions
create table if not exists public.ryt_reactions (
  rec_id  uuid not null references public.ryt_recs (id) on delete cascade,
  emoji   text not null check (emoji in ('🔥', '👀', '🙌', '😂')),
  n       integer not null default 0 check (n >= 0),
  primary key (rec_id, emoji)
);
alter table public.ryt_reactions enable row level security;
-- Counts are public for verdicts that are public; nobody writes directly (ryt_react does).
do $$ begin
  create policy ryt_reactions_read on public.ryt_reactions for select using (
    exists (select 1 from public.ryt_recs r where r.id = rec_id and not r.hidden and (r.status in ('tried', 'already_done') or r.trying)));
exception when duplicate_object then null; end $$;

create or replace function public.ryt_react(p_rec uuid, p_emoji text, p_delta integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if p_emoji not in ('🔥', '👀', '🙌', '😂') then raise exception 'Unknown reaction' using errcode = 'P0001'; end if;
  if not exists (select 1 from ryt_recs r where r.id = p_rec and not r.hidden and (r.status in ('tried', 'already_done') or r.trying)) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  insert into ryt_reactions (rec_id, emoji, n) values (p_rec, p_emoji, greatest(sign(p_delta), 0))
  on conflict (rec_id, emoji) do update set n = greatest(ryt_reactions.n + sign(p_delta)::integer, 0)
  returning n into v_n;
  return v_n;
end $$;
revoke all on function public.ryt_react(uuid, text, integer) from public;
grant execute on function public.ryt_react(uuid, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------- answering a request
create or replace function public.ryt_answer(
  p_ask uuid, p_title text, p_category text default 'other', p_link text default null,
  p_cover_url text default null, p_pitch text default '', p_sender_name text default '', p_show_sender boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_handle text; v_id uuid;
begin
  select p.handle into v_handle from ryt_asks a join ryt_profiles p on p.id = a.owner_id where a.id = p_ask and a.open;
  if v_handle is null then raise exception 'This request is closed' using errcode = 'P0001'; end if;
  v_id := ryt_send(v_handle, p_title, p_category, p_link, p_cover_url, p_pitch, p_sender_name, p_show_sender);
  update ryt_recs set ask_id = p_ask where id = v_id;
  return v_id;
end $$;
revoke all on function public.ryt_answer(uuid, text, text, text, text, text, text, boolean) from public;
grant execute on function public.ryt_answer(uuid, text, text, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- the public page, v2
-- Same columns as before, in the same order, plus the new ones at the end; now also lists
-- what the owner is trying right now.
create or replace view public.ryt_public_recs as
select r.id, r.owner_id, p.handle as owner_handle, r.title, r.category, r.link, r.cover_url, r.pitch, r.tags,
       r.status, r.rating, r.review, r.created_at, r.decided_at,
       case when r.show_sender then nullif(r.sender_name, '') end as sender_name,
       case when r.show_sender then sp.handle end as sender_handle,
       r.trying, case when r.trying then r.progress else '' end as progress, r.pinned, r.extra,
       coalesce((select jsonb_object_agg(x.emoji, x.n) from public.ryt_reactions x where x.rec_id = r.id and x.n > 0), '{}'::jsonb) as reactions,
       r.ask_id
from public.ryt_recs r
join public.ryt_profiles p on p.id = r.owner_id
left join public.ryt_profiles sp on sp.id = r.sender_id
where (r.status in ('tried', 'already_done') or r.trying) and not r.hidden;

grant select on public.ryt_public_recs to anon, authenticated;
