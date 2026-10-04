import { mvpRanking, outcomeFor, teamOf } from './rules';
import type { ID, Match } from './types';

export type PlayerStats = {
  playerId: ID;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  goals: number;
  assists: number;
  goalsPerMatch: number;
  assistsPerMatch: number;
  mvpPoints: number;
  mvpWins: number;
};

const empty = (playerId: ID): PlayerStats => ({
  playerId,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  winRate: 0,
  goals: 0,
  assists: 0,
  goalsPerMatch: 0,
  assistsPerMatch: 0,
  mvpPoints: 0,
  mvpWins: 0,
});

/** Aggregates finished matches only. */
export function computeStats(matches: Match[], playerIds: ID[]): PlayerStats[] {
  const byPlayer = new Map<ID, PlayerStats>(playerIds.map((id) => [id, empty(id)]));
  const get = (id: ID) => {
    let s = byPlayer.get(id);
    if (!s) {
      s = empty(id);
      byPlayer.set(id, s);
    }
    return s;
  };

  for (const match of matches) {
    if (match.status !== 'finished') continue;
    for (const id of [...match.teamA, ...match.teamB]) {
      const team = teamOf(match, id)!;
      const s = get(id);
      s.played++;
      const o = outcomeFor(match, team);
      if (o === 'win') s.wins++;
      else if (o === 'draw') s.draws++;
      else s.losses++;
    }
    for (const g of match.goals) {
      if (g.scorerId) get(g.scorerId).goals++;
      if (g.assistId) get(g.assistId).assists++;
    }
    const ranking = mvpRanking(match);
    ranking.forEach((r) => (get(r.playerId).mvpPoints += r.points));
    if (ranking[0] && ranking[0].points > (ranking[1]?.points ?? 0)) get(ranking[0].playerId).mvpWins++;
  }

  for (const s of byPlayer.values()) {
    if (s.played > 0) {
      s.winRate = s.wins / s.played;
      s.goalsPerMatch = s.goals / s.played;
      s.assistsPerMatch = s.assists / s.played;
    }
  }
  return [...byPlayer.values()];
}
