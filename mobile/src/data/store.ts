/**
 * Server-backed data layer. Screens read everything through `useData()` and
 * write through `repo`; this file is the only one that talks to Supabase.
 * Every change on the server (from any phone) triggers a reload through realtime.
 */
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

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
    sessions: (sessions.data ?? []).map((s) => {
      const mine = (answers.data ?? []).filter((a) => a.session_id === s.id);
      return {
        id: s.id,
        groupId: s.group_id,
        format: s.format as Format,
        date: s.date,
        place: s.place,
        status: s.status,
        captainId: s.captain_id,
        capacity: s.capacity,
        registrations: mine.filter((a) => a.answer === 'in').map((a) => a.profile_id),
        declined: mine.filter((a) => a.answer === 'out').map((a) => a.profile_id),
        createdAt: s.created_at,
      } satisfies Session;
    }),
    matches: (matches.data ?? []).map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      groupId: m.group_id,
      format: m.format as Format,
      status: m.status,
      teamA: m.team_a,
      teamB: m.team_b,
      opponentName: m.opponent_name,
      goals: (goals.data ?? [])
        .filter((g) => g.match_id === m.id)
        .map((g) => ({ id: g.id, team: g.team, scorerId: g.scorer_id, assistId: g.assist_id, at: g.at })),
      mvp: mvpRows.filter((r) => r.match_id === m.id).map((r) => ({ playerId: r.profile_id, points: r.points })),
      voters: voterRows.filter((r) => r.match_id === m.id).map((r) => r.voter_id),
      createdAt: m.created_at,
      startedAt: m.started_at,
      finishedAt: m.finished_at,
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
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
  }
  channel.subscribe();
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

async function after<T>(promise: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>) {
  const { data, error } = await promise;
  if (error) {
    await load().catch(() => {});
    fail(error);
  }
  await load();
  return data;
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
    await after(supabase.from('profiles').update({ name: name.trim() }).eq('id', playerId));
  },

  async createGroup(name: string) {
    return (await after(supabase.rpc('create_group', { group_name: name.trim() }))) as ID;
  },

  async renameGroup(groupId: ID, name: string) {
    await after(supabase.from('groups').update({ name: name.trim() }).eq('id', groupId));
  },

  /** With an email, the player stays "invited" until they sign in with it. */
  async addMember(groupId: ID, name: string, contact: Contact | null) {
    return (await after(
      supabase.rpc('invite_member', {
        g: groupId,
        player_name: name.trim(),
        contact_email: contact?.value ?? null,
        contact_phone: null,
      }),
    )) as ID;
  },

  async joinGroup(code: string) {
    return (await after(supabase.rpc('join_group', { code }))) as ID;
  },

  async setRole(groupId: ID, playerId: ID, role: Role) {
    await after(supabase.rpc('set_member_role', { g: groupId, p: playerId, new_role: role }));
  },

  async removeMember(groupId: ID, playerId: ID) {
    await after(supabase.rpc('remove_member', { g: groupId, p: playerId }));
  },

  /** Opening a session sends the invitation to every member of the group. */
  async createSession(groupId: ID, input: { format: Format; date: string; place: string; capacity: number }) {
    const row = await after(
      supabase
        .from('sessions')
        .insert({ group_id: groupId, format: input.format, date: input.date, place: input.place.trim(), capacity: input.capacity })
        .select('id')
        .single(),
    );
    return row!.id as ID;
  },

  async setCapacity(sessionId: ID, capacity: number) {
    await after(supabase.from('sessions').update({ capacity: Math.max(1, capacity) }).eq('id', sessionId));
  },

  async setSessionStatus(sessionId: ID, value: Session['status']) {
    await after(supabase.from('sessions').update({ status: value }).eq('id', sessionId));
  },

  async setCaptain(sessionId: ID, playerId: ID | null) {
    await after(supabase.from('sessions').update({ captain_id: playerId }).eq('id', sessionId));
  },

  async deleteSession(sessionId: ID) {
    await after(supabase.from('sessions').delete().eq('id', sessionId));
  },

  /**
   * Answer to the invitation. The server stamps the time, so "Présent" always
   * goes to the back of the queue: no jumping ahead.
   */
  async answer(sessionId: ID, playerId: ID, value: 'in' | 'out' | 'none') {
    if (value === 'none') {
      await after(supabase.from('session_answers').delete().match({ session_id: sessionId, profile_id: playerId }));
    } else {
      await after(supabase.from('session_answers').upsert({ session_id: sessionId, profile_id: playerId, answer: value }));
    }
  },

  async createMatch(sessionId: ID) {
    const row = await after(supabase.from('matches').insert({ session_id: sessionId }).select('id').single());
    return row!.id as ID;
  },

  async deleteMatch(matchId: ID) {
    await after(supabase.from('matches').delete().eq('id', matchId));
  },

  async setTeams(matchId: ID, teamA: ID[], teamB: ID[], opponentName = '') {
    await after(supabase.from('matches').update({ team_a: teamA, team_b: teamB, opponent_name: opponentName.trim() }).eq('id', matchId));
  },

  async startMatch(matchId: ID) {
    const startedAt = findMatch(state, matchId)?.startedAt ?? new Date().toISOString();
    await after(supabase.from('matches').update({ status: 'live', started_at: startedAt }).eq('id', matchId));
  },

  async finishMatch(matchId: ID) {
    await after(supabase.from('matches').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', matchId));
  },

  async resumeMatch(matchId: ID) {
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
    await after(supabase.from('votes').insert({ match_id: matchId, voter_id: voterId, pick1: picks[0], pick2: picks[1], pick3: picks[2] }));
  },

  /** Store requirement: deletes the account from inside the app. */
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account');
    fail(error);
    await repo.signOut();
  },
};
