import type { Group, ID, Match, Session, Team } from './types';

export const MVP_POINTS = [3, 2, 1] as const;

export function teamSize(format: 5 | 11) {
  return format;
}

export function isAdmin(group: Group | undefined, playerId: ID | null) {
  if (!group || !playerId) return false;
  return group.members.some((m) => m.playerId === playerId && m.role === 'admin');
}

export function isMember(group: Group | undefined, playerId: ID | null) {
  if (!group || !playerId) return false;
  return group.members.some((m) => m.playerId === playerId);
}

export function isCaptain(session: Session | undefined, playerId: ID | null) {
  return !!session && !!playerId && session.captainId === playerId;
}

/** The captain composes; admins can step in when the captain is absent. */
export function defaultCapacity(format: 5 | 11) {
  return format === 5 ? 10 : 11;
}

/** First come, first served: the first `capacity` "présent" answers get a spot. */
export function lineup(session: Session) {
  return {
    confirmed: session.registrations.slice(0, session.capacity),
    waiting: session.registrations.slice(session.capacity),
  };
}

export type Answer = 'in' | 'waiting' | 'out' | 'none';

export function answerOf(session: Session, playerId: ID): Answer {
  const i = session.registrations.indexOf(playerId);
  if (i >= 0) return i < session.capacity ? 'in' : 'waiting';
  return session.declined.includes(playerId) ? 'out' : 'none';
}

export function canManageMatch(group: Group | undefined, session: Session | undefined, playerId: ID | null) {
  return isCaptain(session, playerId) || isAdmin(group, playerId);
}

export function playersOf(match: Match) {
  return [...match.teamA, ...match.teamB];
}

export function teamOf(match: Match, playerId: ID): Team | null {
  if (match.teamA.includes(playerId)) return 'A';
  if (match.teamB.includes(playerId)) return 'B';
  return null;
}

export function score(match: Match) {
  let a = 0;
  let b = 0;
  for (const g of match.goals) {
    if (g.team === 'A') a++;
    else b++;
  }
  return { a, b };
}

export function outcomeFor(match: Match, team: Team): 'win' | 'draw' | 'loss' {
  const { a, b } = score(match);
  if (a === b) return 'draw';
  const aWon = a > b;
  return (team === 'A') === aWon ? 'win' : 'loss';
}

export function isComposed(match: Match) {
  const size = teamSize(match.format);
  if (match.format === 5) return match.teamA.length === size && match.teamB.length === size;
  return match.teamA.length === size;
}

/** Returns an error message, or null when the ballot is valid. */
export function validateVote(match: Match, voterId: ID, picks: ID[]): string | null {
  const present = playersOf(match);
  if (!present.includes(voterId)) return 'Seuls les joueurs du match peuvent voter.';
  if (match.voters.includes(voterId)) return 'Ce joueur a déjà voté.';
  if (picks.length !== 3) return 'Choisis trois joueurs.';
  if (new Set(picks).size !== 3) return 'Choisis trois joueurs différents.';
  if (picks.includes(voterId)) return 'On ne peut pas voter pour soi-même.';
  if (picks.some((p) => !present.includes(p))) return 'Tu ne peux voter que pour des joueurs du match.';
  return null;
}

export function mvpRanking(match: Match) {
  return [...match.mvp].sort((x, y) => y.points - x.points);
}
