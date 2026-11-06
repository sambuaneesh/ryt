-- RYT v2: "My list", your own list of things to try (a watch list, reading list, places…).
-- Additive only, ryt_* objects only, safe to run twice. Run after 0001–0003.
--
--   ryt_recs.on_list  shown on your page under "My list" while you haven't tried it yet
--                     (things you add yourself start on it; hide any of them any time)
--   ryt_public_recs   also shows what's on your list (not hidden, not tried yet)

alter table public.ryt_recs add column if not exists on_list boolean not null default false;

create or replace view public.ryt_public_recs as
select r.id, r.owner_id, p.handle as owner_handle, r.title, r.category, r.link, r.cover_url, r.pitch, r.tags,
       r.status, r.rating, r.review, r.created_at, r.decided_at,
       case when r.show_sender then nullif(r.sender_name, '') end as sender_name,
       case when r.show_sender then sp.handle end as sender_handle,
       r.trying, case when r.trying then r.progress else '' end as progress, r.pinned, r.extra,
       coalesce((select jsonb_object_agg(x.emoji, x.n) from public.ryt_reactions x where x.rec_id = r.id and x.n > 0), '{}'::jsonb) as reactions,
       r.ask_id,
       r.on_list
from public.ryt_recs r
join public.ryt_profiles p on p.id = r.owner_id
left join public.ryt_profiles sp on sp.id = r.sender_id
where (r.status in ('tried', 'already_done') or r.trying or (r.on_list and r.status in ('new', 'up_next'))) and not r.hidden;

grant select on public.ryt_public_recs to anon, authenticated;
