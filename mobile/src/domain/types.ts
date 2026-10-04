export type ID = string;

export type Player = {
  id: ID;
  name: string;
  /** Contact used to send the group invitation. */
  email?: string;
  phone?: string;
  /** False for a player added without account (no smartphone, not joined yet). */
  hasAccount: boolean;
  createdAt: string;
};

export type Role = 'admin' | 'member';

export type Membership = {
  playerId: ID;
  role: Role;
  /** "invited" until the player accepts the invitation to the group. */
  status: 'invited' | 'active';
  joinedAt: string;
};

export type Group = {
  id: ID;
  name: string;
  createdBy: ID | null;
  createdAt: string;
  members: Membership[];
  /** Code carried by invitation links: footcomp://join/<code>. */
  inviteCode: string;
  /** End of the free month: every feature is unlocked until then. */
  trialEndsAt: string;
  /** Paid by an admin for the whole group; null when not subscribed. */
  subscribedUntil: string | null;
  /** Free month withdrawn by the server: same crew as an older group whose free month ran out. */
  trialRevoked: boolean;
};

export type Format = 5 | 11;

export type SessionStatus = 'open' | 'closed';

export type Session = {
  id: ID;
  groupId: ID;
  format: Format;
  /** ISO date-time of the kick-off. */
  date: string;
  place: string;
  status: SessionStatus;
  captainId: ID | null;
  /** How many players get a spot; later answers go to the waiting list. */
  capacity: number;
  /** "Présent" answers in arrival order: the first `capacity` are in. */
  registrations: ID[];
  /** "Absent" answers. */
  declined: ID[];
  createdAt: string;
};

export type Team = 'A' | 'B';

export type MatchStatus = 'draft' | 'live' | 'finished';

export type Goal = {
  id: ID;
  team: Team;
  /** null for a goal by the opponent in an 11-a-side match. */
  scorerId: ID | null;
  assistId: ID | null;
  at: string;
};

export type Match = {
  id: ID;
  sessionId: ID;
  groupId: ID;
  format: Format;
  status: MatchStatus;
  teamA: ID[];
  /** Empty in 11-a-side: the captain only composes his own team. */
  teamB: ID[];
  opponentName: string;
  goals: Goal[];
  /** MVP points per player (ballots stay private on the server). */
  mvp: { playerId: ID; points: number }[];
  /** Players who already voted. */
  voters: ID[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AppData = {
  /** Profile of the signed-in player. */
  currentPlayerId: ID | null;
  /** The free month is offered only on the first group a player creates. */
  trialUsed: boolean;
  players: Player[];
  groups: Group[];
  sessions: Session[];
  matches: Match[];
};
