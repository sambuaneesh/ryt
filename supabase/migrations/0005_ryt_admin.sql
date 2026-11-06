-- RYT: an admin view of everyone with a RYT page (the /admin screen). Read only.
-- Additive only, ryt_* objects only, safe to run twice. Run after 0001–0004.
--
--   ryt_admins         who may open /admin. No policies: nobody can read or change it through
--                      the API; add yourself in the SQL editor (see the end of this file).
--   ryt_is_admin()     am I an admin? (the app uses it to show the Admin link)
--   ryt_admin_users()  everyone with a RYT page, with their email, last sign-in and counts.
--                      Only RYT profiles: other apps' users in this shared project never show.

create table if not exists public.ryt_admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now()
);
alter table public.ryt_admins enable row level security;
revoke all on public.ryt_admins from anon, authenticated;

create or replace function public.ryt_is_admin()
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.ryt_admins where user_id = auth.uid())
$$;

create or replace function public.ryt_admin_users()
returns table (id uuid, handle text, name text, avatar_url text, bio text, inbox text, design text,
               created_at timestamptz, email text, last_sign_in_at timestamptz,
               received int, added int, tried int, on_list int, sent int, last_active timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.ryt_is_admin() then
    raise exception 'Only admins can see this' using errcode = '42501';
  end if;
  return query
  select p.id, p.handle, p.name, p.avatar_url, p.bio, p.inbox,
         coalesce(case when p.theme ? 'fork' then 'fork' end, p.theme->>'design', p.theme->>'preset', 'default'),
         p.created_at, u.email::text, u.last_sign_in_at,
         (select count(*) from public.ryt_recs r where r.owner_id = p.id and not r.manual)::int,
         (select count(*) from public.ryt_recs r where r.owner_id = p.id and r.manual)::int,
         (select count(*) from public.ryt_recs r where r.owner_id = p.id and r.status in ('tried', 'already_done'))::int,
         (select count(*) from public.ryt_recs r where r.owner_id = p.id and r.status in ('new', 'up_next') and r.on_list and not r.hidden)::int,
         (select count(*) from public.ryt_recs r where r.sender_id = p.id)::int,
         greatest(p.created_at,
                  (select max(greatest(r.created_at, coalesce(r.decided_at, r.created_at))) from public.ryt_recs r where r.owner_id = p.id),
                  (select max(r.created_at) from public.ryt_recs r where r.sender_id = p.id))
  from public.ryt_profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end $$;

revoke execute on function public.ryt_is_admin() from public, anon;
revoke execute on function public.ryt_admin_users() from public, anon;
grant execute on function public.ryt_is_admin() to authenticated;
grant execute on function public.ryt_admin_users() to authenticated;

-- Make yourself an admin (run once, with your own handle):
--   insert into public.ryt_admins (user_id) select id from public.ryt_profiles where handle = 'me' on conflict do nothing;
