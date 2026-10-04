-- FootComp: initial schema.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Security model: every table has RLS; anything with business rules
-- (create a group, invite, roles, account deletion) goes through RPCs.

create extension if not exists pgcrypto;

-- ───────────────────────────── Tables ─────────────────────────────

-- A player. Can exist without an account (invited, or no smartphone);
-- user_id is filled when the person signs in with a matching email / phone.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

-- Kept apart from profiles so only the player and their group admins can read them.
create table public.profile_contacts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text unique check (email = lower(email)),
  phone text unique check (phone ~ '^\+\d{8,15}$')
);

create function public.new_invite_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6)
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  invite_code text not null unique default public.new_invite_code(),
  trial_ends_at timestamptz not null default now() + interval '30 days',
  -- Written only by the server (store webhook), never by the app.
  subscribed_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('invited', 'active')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index group_members_profile_idx on public.group_members (profile_id);

-- One invitation to a match day.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  format smallint not null check (format in (5, 11)),
  date timestamptz not null,
  place text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  captain_id uuid references public.profiles (id) on delete set null,
  capacity smallint not null check (capacity between 1 and 60),
  created_at timestamptz not null default now()
);
create index sessions_group_idx on public.sessions (group_id, date desc);

-- "Présent" / "Absent". The first `capacity` "in" answers by answered_at are
-- registered; answered_at is always set by the server so nobody can jump the queue.
create table public.session_answers (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('in', 'out')),
  answered_at timestamptz not null default clock_timestamp(),
  primary key (session_id, profile_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  format smallint not null check (format in (5, 11)),
  status text not null default 'draft' check (status in ('draft', 'live', 'finished')),
  team_a uuid[] not null default '{}',
  team_b uuid[] not null default '{}',
  opponent_name text not null default '',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index matches_session_idx on public.matches (session_id);
create index matches_group_idx on public.matches (group_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  scorer_id uuid references public.profiles (id) on delete set null, -- null: opponent goal (11-a-side)
  assist_id uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);
create index goals_match_idx on public.goals (match_id);

-- MVP ballot: top 1 = 3 pts, top 2 = 2 pts, top 3 = 1 pt. Anonymous to other players.
create table public.votes (
  match_id uuid not null references public.matches (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  pick1 uuid not null references public.profiles (id),
  pick2 uuid not null references public.profiles (id),
  pick3 uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id),
  check (pick1 <> pick2 and pick1 <> pick3 and pick2 <> pick3),
  check (voter_id not in (pick1, pick2, pick3))
);

-- ───────────────────────────── Helpers ─────────────────────────────

create function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

create function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and profile_id = me())
$$;

create function public.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and profile_id = me() and role = 'admin')
$$;

create function public.has_premium(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(subscribed_until > now(), false) or trial_ends_at > now() from groups where id = g
$$;

-- Captain of the session or admin of its group.
create function public.can_manage(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin(group_id) or captain_id = me() from sessions where id = s
$$;

create function public.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    when regexp_replace(p, '[\s.\-()]', '', 'g') ~ '^0[67]\d{8}$'
      then '+33' || substr(regexp_replace(p, '[\s.\-()]', '', 'g'), 2)
    else '+' || ltrim(regexp_replace(p, '[\s.\-()]', '', 'g'), '+')
  end
$$;

-- ───────────────────────────── Triggers ─────────────────────────────

-- Sign-in: attach the auth user to the profile already invited with that
-- email / phone, or create a fresh profile.
create function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid;
  e text := lower(nullif(new.email, ''));
  ph text := normalize_phone(nullif(new.phone, ''));
begin
  select id into p from profiles where user_id = new.id;

  if p is null then
    select pc.profile_id into p
    from profile_contacts pc join profiles pr on pr.id = pc.profile_id
    where pr.user_id is null and not pr.deleted
      and ((e is not null and pc.email = e) or (ph is not null and pc.phone = ph))
    limit 1;

    if p is null then
      insert into profiles (user_id, name)
      values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(e, ''), '@', 1), ''), 'Joueur'), 40))
      returning id into p;
    else
      update profiles set user_id = new.id where id = p;
      update group_members set status = 'active' where profile_id = p;
    end if;
  end if;

  insert into profile_contacts (profile_id) values (p) on conflict do nothing;
  if e is not null and not exists (select 1 from profile_contacts where email = e and profile_id <> p) then
    update profile_contacts set email = e where profile_id = p;
  end if;
  if ph is not null and not exists (select 1 from profile_contacts where phone = ph and profile_id <> p) then
    update profile_contacts set phone = ph where profile_id = p;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_auth_user();
create trigger on_auth_user_contact_changed after update of email, phone on auth.users
  for each row execute function public.handle_auth_user();

create function public.stamp_answer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.answer is distinct from old.answer then
    new.answered_at := clock_timestamp();
  else
    new.answered_at := old.answered_at;
  end if;
  -- A captain who withdraws stops being captain.
  if new.answer = 'out' then
    update sessions set captain_id = null where id = new.session_id and captain_id = new.profile_id;
  end if;
  return new;
end $$;

create trigger session_answers_stamp before insert or update on public.session_answers
  for each row execute function public.stamp_answer();

create function public.fill_match() returns trigger
language plpgsql as $$
begin
  select group_id, format into new.group_id, new.format from sessions where id = new.session_id;
  return new;
end $$;

create trigger matches_fill before insert on public.matches
  for each row execute function public.fill_match();

-- ───────────────────────────── RLS ─────────────────────────────

alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.sessions enable row level security;
alter table public.session_answers enable row level security;
alter table public.matches enable row level security;
alter table public.goals enable row level security;
alter table public.votes enable row level security;

revoke all on all tables in schema public from anon;

-- Profiles: yourself and anyone sharing a group with you.
create policy profiles_select on public.profiles for select to authenticated using (
  id = me() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.profile_id = profiles.id and b.profile_id = me()
  )
);
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create policy contacts_select on public.profile_contacts for select to authenticated using (
  profile_id = me() or exists (
    select 1 from group_members gm where gm.profile_id = profile_contacts.profile_id and is_admin(gm.group_id)
  )
);

create policy groups_select on public.groups for select to authenticated using (is_member(id));
create policy groups_update on public.groups for update to authenticated using (is_admin(id));
create policy groups_delete on public.groups for delete to authenticated using (is_admin(id));
revoke insert, update on public.groups from authenticated;
grant update (name) on public.groups to authenticated;

create policy members_select on public.group_members for select to authenticated using (is_member(group_id));

create policy sessions_select on public.sessions for select to authenticated using (is_member(group_id));
create policy sessions_insert on public.sessions for insert to authenticated with check (is_admin(group_id));
create policy sessions_update on public.sessions for update to authenticated using (is_admin(group_id));
create policy sessions_delete on public.sessions for delete to authenticated using (is_admin(group_id));

create policy answers_select on public.session_answers for select to authenticated using (
  exists (select 1 from sessions s where s.id = session_id and is_member(s.group_id))
);
-- Your own answer while the invitation is open, or any answer for an admin.
create policy answers_write on public.session_answers for all to authenticated
using (
  exists (
    select 1 from sessions s where s.id = session_answers.session_id
      and (is_admin(s.group_id) or (session_answers.profile_id = me() and s.status = 'open' and is_member(s.group_id)))
  )
)
with check (
  exists (
    select 1 from sessions s
    join group_members gm on gm.group_id = s.group_id and gm.profile_id = session_answers.profile_id
    where s.id = session_answers.session_id
      and (is_admin(s.group_id) or (session_answers.profile_id = me() and s.status = 'open'))
  )
);

create policy matches_select on public.matches for select to authenticated using (is_member(group_id));
create policy matches_insert on public.matches for insert to authenticated
  with check (can_manage(session_id) and has_premium((select group_id from sessions where id = session_id)));
create policy matches_update on public.matches for update to authenticated
  using (can_manage(session_id) and has_premium(group_id));
create policy matches_delete on public.matches for delete to authenticated using (can_manage(session_id));

create policy goals_select on public.goals for select to authenticated using (
  exists (select 1 from matches m where m.id = match_id and is_member(m.group_id))
);
create policy goals_write on public.goals for all to authenticated
using (
  exists (select 1 from matches m where m.id = match_id and m.status = 'live' and can_manage(m.session_id) and has_premium(m.group_id))
)
with check (
  exists (select 1 from matches m where m.id = match_id and m.status = 'live' and can_manage(m.session_id) and has_premium(m.group_id))
);

-- Ballots are private: you only ever read your own.
create policy votes_select on public.votes for select to authenticated using (voter_id = me());
-- Players of the match vote for themselves; the captain/admin can record the
-- ballot of a player who has no account.
create policy votes_insert on public.votes for insert to authenticated with check (
  exists (
    select 1 from matches m where m.id = match_id
      and m.status = 'finished'
      and has_premium(m.group_id)
      and voter_id = any (m.team_a || m.team_b)
      and pick1 = any (m.team_a || m.team_b)
      and pick2 = any (m.team_a || m.team_b)
      and pick3 = any (m.team_a || m.team_b)
      and (
        voter_id = me()
        or (can_manage(m.session_id) and (select user_id from profiles where id = voter_id) is null)
      )
  )
);

-- ───────────────────────────── RPCs ─────────────────────────────

create function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if me() is null then raise exception 'Connecte-toi pour créer un groupe.'; end if;
  insert into groups (name, created_by) values (btrim(group_name), me()) returning id into g;
  insert into group_members (group_id, profile_id, role, status) values (g, me(), 'admin', 'active');
  return g;
end $$;

-- Adds a player by name, optionally with an email or mobile to invite them.
-- Reuses the existing profile when that contact is already known.
create function public.invite_member(g uuid, player_name text, contact_email text default null, contact_phone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p uuid;
  e text := lower(nullif(btrim(contact_email), ''));
  ph text := normalize_phone(contact_phone);
  account boolean;
begin
  if not is_admin(g) then raise exception 'Seul un admin peut inviter des joueurs.'; end if;

  select profile_id into p from profile_contacts
  where (e is not null and email = e) or (ph is not null and phone = ph)
  limit 1;

  if p is null then
    insert into profiles (name) values (btrim(player_name)) returning id into p;
    insert into profile_contacts (profile_id, email, phone) values (p, e, ph);
  end if;

  select user_id is not null into account from profiles where id = p;
  insert into group_members (group_id, profile_id, role, status)
  values (g, p, 'member', case when (e is not null or ph is not null) and not account then 'invited' else 'active' end)
  on conflict (group_id, profile_id) do nothing;
  return p;
end $$;

create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if me() is null then raise exception 'Connecte-toi pour rejoindre un groupe.'; end if;
  select id into g from groups where invite_code = upper(btrim(code));
  if g is null then raise exception 'Aucun groupe avec ce code.'; end if;
  insert into group_members (group_id, profile_id, role, status) values (g, me(), 'member', 'active')
  on conflict (group_id, profile_id) do update set status = 'active';
  return g;
end $$;

create function public.set_member_role(g uuid, p uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(g) then raise exception 'Seul un admin peut changer les rôles.'; end if;
  if new_role = 'member' and (select count(*) from group_members where group_id = g and role = 'admin' and profile_id <> p) = 0 then
    raise exception 'Le groupe doit garder au moins un admin.';
  end if;
  update group_members set role = new_role where group_id = g and profile_id = p;
end $$;

-- An admin removes someone, or a player leaves.
create function public.remove_member(g uuid, p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin(g) or p = me()) then raise exception 'Action réservée aux admins.'; end if;
  if (select role from group_members where group_id = g and profile_id = p) = 'admin'
     and (select count(*) from group_members where group_id = g and role = 'admin') = 1
     and (select count(*) from group_members where group_id = g) > 1 then
    raise exception 'Le groupe doit garder au moins un admin.';
  end if;
  delete from group_members where group_id = g and profile_id = p;
  delete from groups where id = g and not exists (select 1 from group_members where group_id = g);
end $$;

-- MVP points per player for every finished match of a group (ballots stay private).
create function public.group_mvp(g uuid) returns table (match_id uuid, profile_id uuid, points int)
language sql stable security definer set search_path = public as $$
  select v.match_id, x.pid, sum(x.pts)::int
  from votes v
  join matches m on m.id = v.match_id
  cross join lateral (values (v.pick1, 3), (v.pick2, 2), (v.pick3, 1)) as x (pid, pts)
  where m.group_id = g and is_member(g)
  group by v.match_id, x.pid
$$;

-- Who has voted (not for whom).
create function public.group_voters(g uuid) returns table (match_id uuid, voter_id uuid)
language sql stable security definer set search_path = public as $$
  select v.match_id, v.voter_id from votes v join matches m on m.id = v.match_id
  where m.group_id = g and is_member(g)
$$;

-- Store requirement: delete the account from inside the app.
-- The name disappears; past goals and ballots stay, anonymous, so the other
-- players' stats remain correct.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  p uuid := me();
  g record;
begin
  if p is null then return; end if;

  for g in select group_id from group_members where profile_id = p and role = 'admin' loop
    if not exists (select 1 from group_members where group_id = g.group_id and role = 'admin' and profile_id <> p) then
      update group_members set role = 'admin'
      where (group_id, profile_id) = (
        select group_id, profile_id from group_members
        where group_id = g.group_id and profile_id <> p order by joined_at limit 1
      );
    end if;
  end loop;

  delete from session_answers sa using sessions s
    where sa.session_id = s.id and sa.profile_id = p and s.date > now();
  update sessions set captain_id = null where captain_id = p and date > now();
  delete from group_members where profile_id = p;
  delete from groups gr where not exists (select 1 from group_members where group_id = gr.id);
  delete from profile_contacts where profile_id = p;
  update profiles set name = 'Joueur supprimé', deleted = true, user_id = null where id = p;
  delete from auth.users where id = auth.uid();
end $$;

-- Functions are executable by PUBLIC by default: keep them for signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- ───────────────────────────── Realtime ─────────────────────────────
-- Live score and registrations update on every phone without refreshing.
alter publication supabase_realtime add table
  public.group_members, public.sessions, public.session_answers, public.matches, public.goals;
