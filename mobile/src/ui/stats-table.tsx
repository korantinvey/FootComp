import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PlayerStats } from '@/domain/stats';
import type { ID } from '@/domain/types';

import { tap } from './kit';
import { colors, fonts, space } from './theme';

type Key = keyof Omit<PlayerStats, 'playerId'>;

const COLUMNS: { key: Key; label: string; hint: string; format: (s: PlayerStats) => string }[] = [
  { key: 'played', label: 'MJ', hint: 'Matchs joués', format: (s) => String(s.played) },
  { key: 'winRate', label: 'V %', hint: 'Pourcentage de victoires', format: (s) => (s.played ? `${Math.round(s.winRate * 100)}` : '–') },
  { key: 'wins', label: 'V-N-D', hint: 'Victoires, nuls, défaites', format: (s) => `${s.wins}-${s.draws}-${s.losses}` },
  { key: 'goals', label: 'Buts', hint: 'Buts marqués', format: (s) => String(s.goals) },
  { key: 'goalsPerMatch', label: 'B/M', hint: 'Buts par match', format: (s) => (s.played ? s.goalsPerMatch.toFixed(1) : '–') },
  { key: 'assists', label: 'PD', hint: 'Passes décisives', format: (s) => String(s.assists) },
  { key: 'assistsPerMatch', label: 'PD/M', hint: 'Passes décisives par match', format: (s) => (s.played ? s.assistsPerMatch.toFixed(1) : '–') },
  { key: 'mvpPoints', label: 'Pts MVP', hint: 'Points MVP cumulés', format: (s) => String(s.mvpPoints) },
  { key: 'mvpWins', label: 'Homme du match', hint: 'Fois homme du match (1er du vote MVP)', format: (s) => String(s.mvpWins) },
];

const ROW = 52;
const NAME_W = 132;
const COL_W = 62;
const colWidth = (key: Key) => (key === 'wins' ? COL_W + 14 : key === 'mvpWins' ? COL_W + 54 : COL_W);

export function StatsTable({ stats, nameOf, onPlayer }: { stats: PlayerStats[]; nameOf: (id: ID) => string; onPlayer?: (id: ID) => void }) {
  const [sortKey, setSortKey] = useState<Key>('winRate');

  const rows = useMemo(
    () =>
      [...stats].sort(
        (a, b) => (b[sortKey] as number) - (a[sortKey] as number) || b.played - a.played || nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
      ),
    [stats, sortKey, nameOf],
  );

  return (
    <View style={styles.table}>
      <View style={{ width: NAME_W }}>
        <View style={[styles.cell, styles.head, { alignItems: 'flex-start' }]}>
          <Text style={styles.headLabel}>Joueur</Text>
        </View>
        {rows.map((s, i) => (
          <Pressable
            key={s.playerId}
            accessibilityRole="button"
            accessibilityLabel={`Fiche de ${nameOf(s.playerId)}`}
            onPress={() => onPlayer?.(s.playerId)}
            style={[styles.cell, styles.nameCell, i % 2 === 1 && styles.zebra]}>
            <Text style={styles.rank}>{i + 1}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {nameOf(s.playerId)}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row' }}>
            {COLUMNS.map((c) => {
              const active = c.key === sortKey;
              return (
                <Pressable
                  key={c.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Trier par ${c.hint}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    tap();
                    setSortKey(c.key);
                  }}
                  style={[styles.cell, styles.head, { width: colWidth(c.key) }]}>
                  <Text style={[styles.headLabel, active && { color: colors.highlight }]}>{c.label}</Text>
                  {active && <View style={styles.sortMark} />}
                </Pressable>
              );
            })}
          </View>
          {rows.map((s, i) => (
            <View key={s.playerId} style={[{ flexDirection: 'row' }, i % 2 === 1 && styles.zebra]}>
              {COLUMNS.map((c) => (
                <View key={c.key} style={[styles.cell, { width: colWidth(c.key) }]}>
                  {c.key === 'winRate' && s.played > 0 && (
                    <View style={[styles.winBar, { height: Math.max(3, s.winRate * (ROW - 16)) }]} />
                  )}
                  <Text style={[styles.value, c.key === sortKey && { fontFamily: fonts.displayBlack, color: colors.text }]}>
                    {c.format(s)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export const STATS_LEGEND = COLUMNS.map((c) => `${c.label} : ${c.hint.toLowerCase()}`).join(' · ');

const styles = StyleSheet.create({
  table: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cell: { height: ROW, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(2) },
  head: { height: 40, borderBottomWidth: 1, borderBottomColor: colors.lineStrong },
  headLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2, color: colors.textMuted, },
  sortMark: { position: 'absolute', bottom: 0, left: 12, right: 12, height: 3, backgroundColor: colors.primary },
  nameCell: { flexDirection: 'row', justifyContent: 'flex-start', gap: space(2), paddingLeft: space(3) },
  rank: { fontFamily: fonts.display, fontSize: 16, color: colors.textMuted, width: 18 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flex: 1 },
  zebra: { backgroundColor: '#F8FAFC' },
  value: { fontFamily: fonts.display, fontSize: 20, color: colors.text, opacity: 0.85 },
  winBar: { position: 'absolute', bottom: 0, width: 4, left: 6, backgroundColor: colors.primary, opacity: 0.6, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
});
