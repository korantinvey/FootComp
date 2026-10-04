import type { PlayerStats } from './stats';
import type { ID } from './types';

/**
 * Level estimate from past matches: winning matters most, then goals,
 * assists and MVP points. Players without history get the group average.
 */
export function ratings(pool: ID[], stats: PlayerStats[]) {
  const byId = new Map(stats.map((s) => [s.playerId, s]));
  const score = (s: PlayerStats) =>
    s.winRate * 3 + s.goalsPerMatch + s.assistsPerMatch * 0.7 + (s.mvpPoints / s.played) * 0.5;
  const known = pool.map((id) => byId.get(id)).filter((s): s is PlayerStats => !!s && s.played > 0);
  const average = known.length ? known.reduce((sum, s) => sum + score(s), 0) / known.length : 1;
  return new Map(
    pool.map((id) => {
      const s = byId.get(id);
      return [id, s && s.played > 0 ? score(s) : average];
    }),
  );
}

/** Two teams of `size` with the closest possible total level. */
export function balanceTeams(pool: ID[], stats: PlayerStats[], size: number): [ID[], ID[]] {
  const level = ratings(pool, stats);
  // A little noise so that "Équilibrer" twice in a row doesn't always give the same split.
  const sorted = [...pool].sort((a, b) => level.get(b)! - level.get(a)! + (Math.random() - 0.5) * 0.15).slice(0, size * 2);

  // Snake draft: A B B A A B B A…
  const a: ID[] = [];
  const b: ID[] = [];
  sorted.forEach((id, i) => ((i % 4 === 0 || i % 4 === 3) && a.length < size ? a : b.length < size ? b : a).push(id));

  const total = (team: ID[]) => team.reduce((sum, id) => sum + level.get(id)!, 0);
  // Then swap pairs while it brings the totals closer.
  let improved = true;
  while (improved) {
    improved = false;
    const gap = Math.abs(total(a) - total(b));
    for (let i = 0; i < a.length && !improved; i++) {
      for (let j = 0; j < b.length && !improved; j++) {
        const delta = level.get(a[i])! - level.get(b[j])!;
        if (Math.abs(total(a) - delta - (total(b) + delta)) < gap - 1e-9) {
          [a[i], b[j]] = [b[j], a[i]];
          improved = true;
        }
      }
    }
  }
  return [a, b];
}
