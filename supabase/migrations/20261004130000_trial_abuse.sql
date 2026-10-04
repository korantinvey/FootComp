-- Free month: one per admin account, and not for a "recycled" crew.
--  1. A player gets the free month only on the first group they create.
--  2. A group loses its free month when at least 5 of its members were already
--     in an older group (last 12 months) whose free month ran out without a
--     subscription: same crew, new group.

alter table public.profiles add column trial_used_at timestamptz;

-- Existing creators already used their free month.
update public.profiles p set trial_used_at = g.first_created
from (select created_by, min(created_at) as first_created from public.groups where created_by is not null group by created_by) g
where g.created_by = p.id;

create or replace function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g uuid;
  used timestamptz;
begin
  if me() is null then raise exception 'Connecte-toi pour créer un groupe.'; end if;
  select trial_used_at into used from profiles where id = me() for update;
  insert into groups (name, created_by, trial_ends_at)
  values (btrim(group_name), me(), case when used is null then now() + interval '30 days' else now() end)
  returning id into g;
  if used is null then
    update profiles set trial_used_at = now() where id = me();
  end if;
  insert into group_members (group_id, profile_id, role, status) values (g, me(), 'admin', 'active');
  return g;
end $$;

create function public.trial_revoked(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select count(distinct gm.profile_id) >= 5
  from groups cur
  join group_members gm on gm.group_id = cur.id
  join group_members prev_m on prev_m.profile_id = gm.profile_id and prev_m.group_id <> cur.id
  join groups prev on prev.id = prev_m.group_id
  where cur.id = g
    and prev.created_at < cur.created_at
    and prev.created_at > now() - interval '12 months'
    and prev.trial_ends_at < now()
    and coalesce(prev.subscribed_until < now(), true)
$$;

create or replace function public.has_premium(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(subscribed_until > now(), false) or (trial_ends_at > now() and not trial_revoked(g))
  from groups where id = g
$$;

-- What the app shows for each of my groups.
create function public.my_group_access() returns table (group_id uuid, trial_revoked boolean)
language sql stable security definer set search_path = public as $$
  select gm.group_id, trial_revoked(gm.group_id) from group_members gm where gm.profile_id = me()
$$;

create function public.my_trial_used() returns boolean
language sql stable security definer set search_path = public as $$
  select trial_used_at is not null from profiles where id = me()
$$;

revoke execute on function public.trial_revoked(uuid), public.my_group_access(), public.my_trial_used() from public, anon;
grant execute on function public.trial_revoked(uuid), public.my_group_access(), public.my_trial_used() to authenticated;
