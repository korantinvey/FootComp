-- Player avatar: a jersey from "Choisis ton camp", printed with the player's
-- name and an optional number.
alter table public.profiles
  add column avatar_kit text,
  add column avatar_number smallint check (avatar_number between 0 and 99);

grant update (name, avatar_kit, avatar_number) on public.profiles to authenticated;

-- The captain or an admin can close the MVP vote; the result card is shared
-- once everyone has voted or the vote is closed.
alter table public.matches add column votes_closed boolean not null default false;

drop policy votes_insert on public.votes;
create policy votes_insert on public.votes for insert to authenticated with check (
  exists (
    select 1 from matches m where m.id = match_id
      and m.status = 'finished'
      and not m.votes_closed
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
