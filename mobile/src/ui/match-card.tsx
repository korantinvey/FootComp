import * as Sharing from 'expo-sharing';
import { forwardRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { mvpRanking, score } from '@/domain/rules';
import type { Group, ID, Match, Session } from '@/domain/types';

import { colors, fonts, radius, space } from './theme';

type Props = { match: Match; session: Session; group: Group; nameOf: (id: ID | null) => string };

/** The end-of-match card, also exported as an image for the group chat. */
export const MatchCard = forwardRef<View, Props>(function MatchCard({ match, session, group, nameOf }, ref) {
  const { a, b } = score(match);
  const five = match.format === 5;
  const mvp = mvpRanking(match)[0];
  const scorers = (team: 'A' | 'B') => {
    const count = new Map<string, number>();
    for (const g of match.goals) {
      if (g.team !== team) continue;
      const name = g.scorerId ? nameOf(g.scorerId) : 'Adversaire';
      count.set(name, (count.get(name) ?? 0) + 1);
    }
    return [...count.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
  };
  const date = new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.stripes} pointerEvents="none">
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? colors.pitch : colors.pitchStripe }} />
        ))}
      </View>
      <View style={styles.halfway} />
      <View style={styles.circle} />

      <Text style={styles.group} numberOfLines={1}>
        {group.name}
      </Text>
      <Text style={styles.date}>
        {date}
        {session.place ? ` · ${session.place}` : ''}
      </Text>

      <View style={styles.board}>
        <Text style={[styles.score, { color: colors.teamA }]}>{a}</Text>
        <Text style={styles.colon}>:</Text>
        <Text style={[styles.score, { color: five ? colors.teamB : colors.text }]}>{b}</Text>
      </View>

      <View style={styles.teams}>
        {(['A', 'B'] as const).map((t) => (
          <View key={t} style={[styles.team, t === 'B' && { alignItems: 'flex-end' }]}>
            <Text style={styles.teamName}>{t === 'A' ? (five ? 'Orange' : 'Nous') : five ? 'Bleu' : match.opponentName || 'Adversaire'}</Text>
            {scorers(t).map((s) => (
              <Text key={s} style={styles.scorer} numberOfLines={1}>
                ⚽ {s}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {mvp && (
        <View style={styles.mvp}>
          <Text style={styles.mvpLabel}>Homme du match</Text>
          <Text style={styles.mvpName} numberOfLines={1}>
            ⭐ {nameOf(mvp.playerId)}
          </Text>
        </View>
      )}
      <Text style={styles.brand}>FootComp</Text>
    </View>
  );
});

export const canShareCard = Platform.OS !== 'web';

/** Turns the card into a PNG and opens the share sheet (WhatsApp, Instagram…). */
export async function shareCard(view: View) {
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', width: 1080 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partager le résultat' });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: space(5),
    gap: space(2),
    aspectRatio: 4 / 5,
    justifyContent: 'center',
    backgroundColor: colors.pitch,
  },
  stripes: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'column' },
  halfway: { position: 'absolute', left: 0, right: 0, top: '50%', height: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  circle: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    width: 120,
    height: 120,
    marginTop: -60,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  group: { fontFamily: fonts.displayBlack, fontSize: 26, color: colors.onFill, textAlign: 'center' },
  date: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onFill, textAlign: 'center', opacity: 0.9 },
  board: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space(5),
    marginVertical: space(3),
  },
  score: { fontFamily: fonts.displayBlack, fontSize: 84, lineHeight: 96, minWidth: 56, textAlign: 'center' },
  colon: { fontFamily: fonts.display, fontSize: 56, color: colors.textMuted, marginHorizontal: space(1) },
  teams: { flexDirection: 'row', gap: space(3) },
  team: { flex: 1, gap: 2 },
  teamName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.onFill, opacity: 0.85, marginBottom: 2 },
  scorer: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.onFill },
  mvp: {
    marginTop: space(3),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    maxWidth: '100%',
  },
  mvpLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.highlight },
  mvpName: { fontFamily: fonts.display, fontSize: 18, color: colors.text, flexShrink: 1 },
  brand: { fontFamily: fonts.displayBlack, fontSize: 14, color: colors.onFill, textAlign: 'center', marginTop: space(3), opacity: 0.85 },
});
