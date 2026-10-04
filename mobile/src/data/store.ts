/**
 * Server-backed data layer. Screens read everything through `useData()` and
 * write through `repo`; this file is the only one that talks to Supabase.
 * Every change on the server (from any phone) triggers a reload through realtime.
 */
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { Contact } from '@/domain/contact';
import type { AppData, Format, Goal, ID, Match, Player, Role, Session, Team } from '@/domain/types';

import { unregisterPush } from './push';
import { supabase } from './supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'ready';

const empty: AppData = { currentPlayerId: null, trialUsed: false, players: [], groups: [], sessions: [], matches: [] };

let state: AppData = empty;
let status: AuthStatus = 'loading';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useData() {
  return useSyncExternalStore(subscribe, () => state);
}

/** Current snapshot, for code outside React render. */
export const getData = () => state;

export function useAuthStatus() {
  return useSyncExternalStore(subscribe, () => status);
}

/** Turns a Supabase error into a message for the player. */
function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return;
  if (error.code === '42501' || /row-level security/i.test(error.message)) throw new Error('Tu n’as pas le droit de faire ça.');
  if (/fetch|network/i.test(error.message)) throw new Error('Pas de connexion internet. Réessaie dans un instant.');
  throw new Error(error.message);
}

// ───────────────────────────── Rows → app types ─────────────────────────────

type Row = Record<string, any>;

/** Invitation answers per session, kept to rebuild the queue order on live changes. */
let answersBySession = new Map<ID, Row[]>();

function registrationsOf(sessionId: ID) {
  const rows = [...(answersBySession.get(sessionId) ?? [])].sort((a, b) => a.answered_at.localeCompare(b.answered_at));
  return {
    registrations: rows.filter((a) => a.answer === 'in').map((a) => a.profile_id as ID),
    declined: rows.filter((a) => a.answer === 'out').map((a) => a.profile_id as ID),
  };
}

function toSession(r: Row): Session {
  return {
    id: r.id,
    groupId: r.group_id,
    format: r.format as Format,
    date: r.date,
    place: r.place,
    status: r.status,
    captainId: r.captain_id,
    capacity: r.capacity,
    ...registrationsOf(r.id),
    createdAt: r.created_at,
  };
}

const toGoal = (g: Row): Goal => ({ id: g.id, team: g.team, scorerId: g.scorer_id, assistId: g.assist_id, at: g.at });

/** Match fields stored on the matches row (goals and votes come from elsewhere). */
const matchFields = (m: Row) => ({
  id: m.id as ID,
  sessionId: m.session_id as ID,
  groupId: m.group_id as ID,
  format: m.format as Format,
  status: m.status,
  teamA: m.team_a as ID[],
  teamB: m.team_b as ID[],
  opponentName: m.opponent_name as string,
  createdAt: m.created_at as string,
  startedAt: m.started_at as string | null,
  finishedAt: m.finished_at as string | null,
});

// ───────────────────────────── Loading ─────────────────────────────

async function load() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    state = empty;
    status = 'signedOut';
    emit();
    return;
  }

  const [me, groups, members, profiles, contacts, sessions, answers, matches, goals] = await Promise.all([
    supabase.from('profiles').select('id').eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('groups').select('*'),
    supabase.from('group_members').select('*'),
    supabase.from('profiles').select('id, name, user_id, created_at'),
    supabase.from('profile_contacts').select('*'),
    supabase.from('sessions').select('*'),
    supabase.from('session_answers').select('*').order('answered_at'),
    supabase.from('matches').select('*'),
    supabase.from('goals').select('*').order('at'),
  ]);
  for (const r of [me, groups, members, profiles, contacts, sessions, answers, matches, goals]) fail(r.error);

  const groupIds = (groups.data ?? []).map((g) => g.id as string);
  const [mvp, voters, access, trialUsed] = await Promise.all([
    Promise.all(groupIds.map((g) => supabase.rpc('group_mvp', { g }))),
    Promise.all(groupIds.map((g) => supabase.rpc('group_voters', { g }))),
    supabase.rpc('my_group_access'),
    supabase.rpc('my_trial_used'),
  ]);
  const revoked = new Set(((access.data ?? []) as { group_id: string; trial_revoked: boolean }[]).filter((r) => r.trial_revoked).map((r) => r.group_id));

  const contactOf = new Map((contacts.data ?? []).map((c) => [c.profile_id as string, c]));
  const players: Player[] = (profiles.data ?? []).map((p) => {
    const c = contactOf.get(p.id);
    return {
      id: p.id,
      name: p.name,
      ...(c?.email ? { email: c.email } : {}),
      ...(c?.phone ? { phone: c.phone } : {}),
      hasAccount: !!p.user_id,
      createdAt: p.created_at,
    };
  });

  answersBySession = new Map();
  for (const a of answers.data ?? []) {
    const list = answersBySession.get(a.session_id) ?? [];
    list.push(a);
    answersBySession.set(a.session_id, list);
  }

  const mvpRows = mvp.flatMap((r) => (r.data ?? []) as { match_id: string; profile_id: string; points: number }[]);
  const voterRows = voters.flatMap((r) => (r.data ?? []) as { match_id: string; voter_id: string }[]);

  state = {
    currentPlayerId: me.data?.id ?? null,
    trialUsed: !!trialUsed.data,
    players,
    groups: (groups.data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      createdBy: g.created_by,
      createdAt: g.created_at,
      inviteCode: g.invite_code,
      trialEndsAt: g.trial_ends_at,
      subscribedUntil: g.subscribed_until,
      trialRevoked: revoked.has(g.id),
      members: (members.data ?? [])
        .filter((m) => m.group_id === g.id)
        .map((m) => ({ playerId: m.profile_id, role: m.role, status: m.status, joinedAt: m.joined_at })),
    })),
    sessions: (sessions.data ?? []).map(toSession),
    matches: (matches.data ?? []).map((m) => ({
      ...matchFields(m),
      goals: (goals.data ?? []).filter((g) => g.match_id === m.id).map(toGoal),
      mvp: mvpRows.filter((r) => r.match_id === m.id).map((r) => ({ playerId: r.profile_id, points: r.points })),
      voters: voterRows.filter((r) => r.match_id === m.id).map((r) => r.voter_id),
    })),
  };
  status = 'ready';
  emit();
}

let reloadTimer: ReturnType<typeof setTimeout> | null = null;
/** Coalesces bursts of realtime events into one reload. */
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    load().catch(() => {});
  }, 250);
}

let started = false;
/** Call once at startup: follows sign-in / sign-out and live changes. */
export function startSync() {
  if (started) return;
  started = true;
  load().catch(() => {
    status = 'signedOut';
    emit();
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') scheduleReload();
  });
  const channel = supabase.channel('footcomp');
  for (const table of ['group_members', 'sessions', 'session_answers', 'matches', 'goals']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) =>
      applyChange(table, payload.eventType, payload.new as Row, payload.old as Row),
    );
  }
  channel.subscribe();
  // Back from the background, events may have been missed: resync once.
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && status === 'ready') scheduleReload();
  });
}

/**
 * Applies one realtime change to the screen without reloading everything.
 * Falls back to a full reload when the change refers to data the app lacks.
 */
function applyChange(table: string, event: string, row: Row, old: Row) {
  if (status !== 'ready') return;
  const removed = event === 'DELETE';
  const draft: AppData = JSON.parse(JSON.stringify(state));

  switch (table) {
    case 'sessions': {
      draft.sessions = draft.sessions.filter((x) => x.id !== (removed ? old.id : row.id));
      if (!removed) draft.sessions.push(toSession(row));
      break;
    }
    case 'session_answers': {
      const sid = (removed ? old : row).session_id as ID;
      const pid = (removed ? old : row).profile_id as ID;
      const list = (answersBySession.get(sid) ?? []).filter((a) => a.profile_id !== pid);
      if (!removed) list.push(row);
      answersBySession.set(sid, list);
      const session = draft.sessions.find((x) => x.id === sid);
      if (session) Object.assign(session, registrationsOf(sid));
      break;
    }
    case 'matches': {
      if (removed) {
        draft.matches = draft.matches.filter((m) => m.id !== old.id);
        break;
      }
      const existing = findMatch(draft, row.id);
      if (existing) Object.assign(existing, matchFields(row));
      else draft.matches.push({ ...matchFields(row), goals: [], mvp: [], voters: [] });
      break;
    }
    case 'goals': {
      const id = (removed ? old : row).id as ID;
      for (const m of draft.matches) m.goals = m.goals.filter((g) => g.id !== id);
      if (!removed) findMatch(draft, row.match_id)?.goals.push(toGoal(row));
      for (const m of draft.matches) m.goals.sort((a, b) => a.at.localeCompare(b.at));
      break;
    }
    case 'group_members': {
      const gid = (removed ? old : row).group_id as ID;
      const pid = (removed ? old : row).profile_id as ID;
      const group = draft.groups.find((g) => g.id === gid);
      const knownPlayer = draft.players.some((p) => p.id === pid);
      // A new group for me, a player never seen before, or my own membership: reload.
      if (!group || (!removed && !knownPlayer) || pid === draft.currentPlayerId) return scheduleReload();
      group.members = group.members.filter((m) => m.playerId !== pid);
      if (!removed) group.members.push({ playerId: pid, role: row.role, status: row.status, joinedAt: row.joined_at });
      break;
    }
  }
  state = draft;
  emit();
}

/** MVP points and voters of one group, after a ballot. */
async function reloadVotes(groupId: ID) {
  const [mvp, voters] = await Promise.all([
    supabase.rpc('group_mvp', { g: groupId }),
    supabase.rpc('group_voters', { g: groupId }),
  ]);
  if (mvp.error || voters.error) return scheduleReload();
  const mvpRows = (mvp.data ?? []) as { match_id: string; profile_id: string; points: number }[];
  const voterRows = (voters.data ?? []) as { match_id: string; voter_id: string }[];
  optimistic((d) => {
    for (const m of d.matches) {
      if (m.groupId !== groupId) continue;
      m.mvp = mvpRows.filter((r) => r.match_id === m.id).map((r) => ({ playerId: r.profile_id, points: r.points }));
      m.voters = voterRows.filter((r) => r.match_id === m.id).map((r) => r.voter_id);
    }
  });
}

export const refresh = () => load();

/** Applies a change on screen right away; the server confirms on the next reload. */
function optimistic(recipe: (draft: AppData) => void) {
  const draft: AppData = JSON.parse(JSON.stringify(state));
  recipe(draft);
  state = draft;
  emit();
}

/** Goals still being saved: an assist or a correction waits for them. */
const savingGoals = new Map<ID, Promise<unknown>>();
const goalSaved = (id: ID) => savingGoals.get(id)?.catch(() => {});

function findMatch(d: AppData, id: ID): Match | undefined {
  return d.matches.find((m) => m.id === id);
}

type Result<T> = PromiseLike<{ data: T; error: { message: string; code?: string } | null }>;

/**
 * Server write whose effect is already on screen (optimistic). Realtime then
 * delivers the confirmed row; on error the server state is restored.
 */
async function after<T>(promise: Result<T>) {
  const { data, error } = await promise;
  if (error) {
    await load().catch(() => {});
    fail(error);
  }
  return data;
}

/** For creations: the next screen needs the new row, so wait for the reload. */
async function afterAndLoad<T>(promise: Result<T>) {
  const { data, error } = await promise;
  fail(error);
  await load();
  return data;
}

function patchSession(id: ID, recipe: (s: Session) => void) {
  optimistic((d) => {
    const s = d.sessions.find((x) => x.id === id);
    if (s) recipe(s);
  });
}

function patchMatch(id: ID, recipe: (m: Match) => void) {
  optimistic((d) => {
    const m = findMatch(d, id);
    if (m) recipe(m);
  });
}

function patchGroup(id: ID, recipe: (g: AppData['groups'][number]) => void) {
  optimistic((d) => {
    const g = d.groups.find((x) => x.id === id);
    if (g) recipe(g);
  });
}

// ───────────────────────────── Actions ─────────────────────────────

export const repo = {
  /** Sends a 6-digit code by email. The name is used if the account is new. */
  async sendCode(email: string, name: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, data: { name: name.trim() } },
    });
    if (error && /rate|security purposes/i.test(error.message)) throw new Error('Trop de demandes. Attends une minute avant de redemander un code.');
    fail(error);
  },

  async verifyCode(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
    if (error) throw new Error('Code incorrect ou expiré. Vérifie l’email ou redemande un code.');
    await load();
  },

  async signOut() {
    await unregisterPush().catch(() => {});
    await supabase.auth.signOut();
    state = empty;
    status = 'signedOut';
    emit();
  },

  async renamePlayer(playerId: ID, name: string) {
    optimistic((d) => {
      const p = d.players.find((x) => x.id === playerId);
      if (p) p.name = name.trim();
    });
    await after(supabase.from('profiles').update({ name: name.trim() }).eq('id', playerId));
  },

  async createGroup(name: string) {
    return (await afterAndLoad(supabase.rpc('create_group', { group_name: name.trim() }))) as ID;
  },

  async renameGroup(groupId: ID, name: string) {
    patchGroup(groupId, (g) => (g.name = name.trim()));
    await after(supabase.from('groups').update({ name: name.trim() }).eq('id', groupId));
  },

  /** With an email, the player stays "invited" until they sign in with it. */
  async addMember(groupId: ID, name: string, contact: Contact | null) {
    return (await afterAndLoad(
      supabase.rpc('invite_member', {
        g: groupId,
        player_name: name.trim(),
        contact_email: contact?.value ?? null,
        contact_phone: null,
      }),
    )) as ID;
  },

  async joinGroup(code: string) {
    return (await afterAndLoad(supabase.rpc('join_group', { code }))) as ID;
  },

  async setRole(groupId: ID, playerId: ID, role: Role) {
    patchGroup(groupId, (g) => g.members.forEach((m) => m.playerId === playerId && (m.role = role)));
    await after(supabase.rpc('set_member_role', { g: groupId, p: playerId, new_role: role }));
  },

  async removeMember(groupId: ID, playerId: ID) {
    patchGroup(groupId, (g) => (g.members = g.members.filter((m) => m.playerId !== playerId)));
    await after(supabase.rpc('remove_member', { g: groupId, p: playerId }));
  },

  /** Opening a session sends the invitation to every member of the group. */
  async createSession(groupId: ID, input: { format: Format; date: string; place: string; capacity: number }) {
    const row = await afterAndLoad(
      supabase
        .from('sessions')
        .insert({ group_id: groupId, format: input.format, date: input.date, place: input.place.trim(), capacity: input.capacity })
        .select('id')
        .single(),
    );
    return row!.id as ID;
  },

  async setCapacity(sessionId: ID, capacity: number) {
    patchSession(sessionId, (s) => (s.capacity = Math.max(1, capacity)));
    await after(supabase.from('sessions').update({ capacity: Math.max(1, capacity) }).eq('id', sessionId));
  },

  async setSessionStatus(sessionId: ID, value: Session['status']) {
    patchSession(sessionId, (s) => (s.status = value));
    await after(supabase.from('sessions').update({ status: value }).eq('id', sessionId));
  },

  async setCaptain(sessionId: ID, playerId: ID | null) {
    patchSession(sessionId, (s) => (s.captainId = playerId));
    await after(supabase.from('sessions').update({ captain_id: playerId }).eq('id', sessionId));
  },

  async deleteSession(sessionId: ID) {
    optimistic((d) => (d.sessions = d.sessions.filter((s) => s.id !== sessionId)));
    await after(supabase.from('sessions').delete().eq('id', sessionId));
  },

  /**
   * Answer to the invitation. The server stamps the time, so "Présent" always
   * goes to the back of the queue: no jumping ahead.
   */
  async answer(sessionId: ID, playerId: ID, value: 'in' | 'out' | 'none') {
    patchSession(sessionId, (s) => {
      const wasIn = s.registrations.includes(playerId);
      s.registrations = s.registrations.filter((x) => x !== playerId);
      s.declined = s.declined.filter((x) => x !== playerId);
      if (value === 'in') s.registrations.push(playerId);
      if (value === 'out') s.declined.push(playerId);
      if (wasIn && value !== 'in' && s.captainId === playerId) s.captainId = null;
    });
    if (value === 'none') {
      await after(supabase.from('session_answers').delete().match({ session_id: sessionId, profile_id: playerId }));
    } else {
      await after(supabase.from('session_answers').upsert({ session_id: sessionId, profile_id: playerId, answer: value }));
    }
  },

  async createMatch(sessionId: ID) {
    const row = await afterAndLoad(supabase.from('matches').insert({ session_id: sessionId }).select('id').single());
    return row!.id as ID;
  },

  async deleteMatch(matchId: ID) {
    optimistic((d) => (d.matches = d.matches.filter((m) => m.id !== matchId)));
    await after(supabase.from('matches').delete().eq('id', matchId));
  },

  async setTeams(matchId: ID, teamA: ID[], teamB: ID[], opponentName = '') {
    patchMatch(matchId, (m) => Object.assign(m, { teamA, teamB, opponentName: opponentName.trim() }));
    await after(supabase.from('matches').update({ team_a: teamA, team_b: teamB, opponent_name: opponentName.trim() }).eq('id', matchId));
  },

  async startMatch(matchId: ID) {
    const startedAt = findMatch(state, matchId)?.startedAt ?? new Date().toISOString();
    patchMatch(matchId, (m) => Object.assign(m, { status: 'live', startedAt }));
    await after(supabase.from('matches').update({ status: 'live', started_at: startedAt }).eq('id', matchId));
  },

  async finishMatch(matchId: ID) {
    const finishedAt = new Date().toISOString();
    patchMatch(matchId, (m) => Object.assign(m, { status: 'finished', finishedAt }));
    await after(supabase.from('matches').update({ status: 'finished', finished_at: finishedAt }).eq('id', matchId));
  },

  async resumeMatch(matchId: ID) {
    patchMatch(matchId, (m) => Object.assign(m, { status: 'live', finishedAt: null }));
    await after(supabase.from('matches').update({ status: 'live', finished_at: null }).eq('id', matchId));
  },

  /** Instant on screen; the id is chosen here so the assist can be set before the server answers. */
  addGoal(matchId: ID, team: Team, scorerId: ID | null) {
    const goal: Goal = { id: Crypto.randomUUID(), team, scorerId, assistId: null, at: new Date().toISOString() };
    optimistic((d) => findMatch(d, matchId)?.goals.push(goal));
    const done = after(
      supabase.from('goals').insert({ id: goal.id, match_id: matchId, team, scorer_id: scorerId, at: goal.at }),
    ).finally(() => savingGoals.delete(goal.id));
    savingGoals.set(goal.id, done);
    return { id: goal.id, done };
  },

  async setAssist(matchId: ID, goalId: ID, assistId: ID | null) {
    optimistic((d) => {
      const g = findMatch(d, matchId)?.goals.find((x) => x.id === goalId);
      if (g) g.assistId = assistId;
    });
    await goalSaved(goalId);
    await after(supabase.from('goals').update({ assist_id: assistId }).eq('id', goalId));
  },

  async removeGoal(matchId: ID, goalId: ID) {
    optimistic((d) => {
      const m = findMatch(d, matchId);
      if (m) m.goals = m.goals.filter((g) => g.id !== goalId);
    });
    await goalSaved(goalId);
    await after(supabase.from('goals').delete().eq('id', goalId));
  },

  async castVote(matchId: ID, voterId: ID, picks: [ID, ID, ID]) {
    patchMatch(matchId, (m) => m.voters.push(voterId));
    const groupId = findMatch(state, matchId)?.groupId;
    await after(supabase.from('votes').insert({ match_id: matchId, voter_id: voterId, pick1: picks[0], pick2: picks[1], pick3: picks[2] }));
    if (groupId) await reloadVotes(groupId);
  },

  /** Store requirement: deletes the account from inside the app. */
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account');
    fail(error);
    await repo.signOut();
  },
};
