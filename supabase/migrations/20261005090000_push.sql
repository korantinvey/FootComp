-- Push notifications, sent by the database itself through the Expo push service:
--   · new match invitation        → every member of the group
--   · a spot opens up             → the first player of the waiting list
--   · named captain               → the captain
--   · match finished              → the players, to vote for the MVPs

create extension if not exists pg_net;

create table public.push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index push_tokens_profile_idx on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (profile_id = me()) with check (profile_id = me());

create function public.push(targets uuid[], title text, body text, url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token, 'title', title, 'body', body, 'sound', 'default',
    'channelId', 'default', 'data', jsonb_build_object('url', url)
  ))
  into messages
  from push_tokens t
  where t.profile_id = any (targets) and t.profile_id is distinct from me();

  if messages is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end $$;

create function public.when_label(d timestamptz) returns text
language sql stable as $$
  select to_char(d at time zone 'Europe/Paris', 'DD/MM') || ' à ' || to_char(d at time zone 'Europe/Paris', 'HH24"h"MI')
$$;

-- New invitation.
create function public.notify_session_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push(
    array(select profile_id from group_members where group_id = new.group_id),
    (select name from groups where id = new.group_id) || ' · nouveau match',
    'Le ' || when_label(new.date) || coalesce(' · ' || nullif(new.place, ''), '') ||
      '. ' || new.capacity || ' places : les premiers qui répondent sont inscrits !',
    '/session/' || new.id
  );
  return new;
end $$;
create trigger sessions_notify_created after insert on public.sessions
  for each row execute function public.notify_session_created();

-- Captain named.
create function public.notify_captain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.captain_id is not null and new.captain_id is distinct from old.captain_id then
    perform push(array[new.captain_id], 'Tu es capitaine 🧢',
      'Match du ' || when_label(new.date) || ' : à toi de faire les compos.', '/session/' || new.id);
  end if;
  return new;
end $$;
create trigger sessions_notify_captain after update of captain_id on public.sessions
  for each row execute function public.notify_captain();

-- A registered player withdraws: the new last registered player was waiting.
create function public.notify_promotion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s sessions;
  promoted uuid;
  was_in boolean := old.answer = 'in';
  still_in boolean := tg_op = 'UPDATE' and new.answer = 'in';
begin
  if not was_in or still_in then return null; end if;
  select * into s from sessions where id = old.session_id;
  -- Session being deleted, or already played.
  if s.id is null or s.date < now() then return null; end if;
  -- Was the leaver inside the registered spots?
  if (select count(*) from session_answers
      where session_id = s.id and answer = 'in' and answered_at < old.answered_at) >= s.capacity then
    return null;
  end if;
  select profile_id into promoted from session_answers
  where session_id = s.id and answer = 'in'
  order by answered_at offset s.capacity - 1 limit 1;
  if promoted is not null then
    perform push(array[promoted], 'Une place s’est libérée ✅',
      'Tu passes de la liste d’attente aux inscrits pour le match du ' || when_label(s.date) || '.',
      '/session/' || s.id);
  end if;
  return null;
end $$;
create trigger session_answers_notify_promotion after update or delete on public.session_answers
  for each row execute function public.notify_promotion();

-- Match over: time to vote.
create function public.notify_vote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    perform push(new.team_a || new.team_b, 'Match terminé ⚽',
      'Vote pour tes 3 MVP du match.', '/match/' || new.id || '/vote');
  end if;
  return new;
end $$;
create trigger matches_notify_vote after update of status on public.matches
  for each row execute function public.notify_vote();

revoke execute on function public.push(uuid[], text, text, text) from public, anon, authenticated;
