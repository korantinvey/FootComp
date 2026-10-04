import { mvpRanking, outcomeFor, teamOf } from './rules';
import type { ID, Match } from './types';

export type Outcome = 'win' | 'draw' | 'loss';

/** Finished matches of a player in a group, oldest first. */
function played(matches: Match[], playerId: ID) {
  return matches
    .filter((m) => m.status === 'finished' && teamOf(m, playerId))
    .sort((a, b) => (a.finishedAt ?? a.createdAt).localeCompare(b.finishedAt ?? b.createdAt));
}

export function playerProfile(matches: Match[], playerId: ID) {
  const history = played(matches, playerId);
  const outcomes: Outcome[] = history.map((m) => outcomeFor(m, teamOf(m, playerId)!));

  let current = 0;
  let best = 0;
  let run = 0;
  for (const o of outcomes) {
    run = o === 'win' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === 'win'; i--) current++;

  // Best partner: teammate with the best win rate together (2 matches minimum).
  const together = new Map<ID, { played: number; wins: number }>();
  history.forEach((m, i) => {
    const team = teamOf(m, playerId) === 'A' ? m.teamA : m.teamB;
    for (const mate of team) {
      if (mate === playerId) continue;
      const t = together.get(mate) ?? { played: 0, wins: 0 };
      t.played++;
      if (outcomes[i] === 'win') t.wins++;
      together.set(mate, t);
    }
  });
  const partner =
    [...together.entries()]
      .filter(([, t]) => t.played >= 2)
      .map(([id, t]) => ({ playerId: id, played: t.played, winRate: t.wins / t.played }))
      .sort((a, b) => b.winRate - a.winRate || b.played - a.played)[0] ?? null;

  // Goals over the last 6 months.
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('fr-FR', { month: 'short' }), goals: 0 };
  });
  for (const m of history) {
    for (const g of m.goals) {
      if (g.scorerId !== playerId) continue;
      const d = new Date(g.at);
      const slot = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (slot) slot.goals++;
    }
  }

  const mvpTop = history.filter((m) => mvpRanking(m)[0]?.playerId === playerId).length;

  return {
    form: outcomes.slice(-5),
    currentStreak: current,
    bestStreak: best,
    partner,
    months,
    mvpTop,
  };
}
