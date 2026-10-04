import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { formatTime, useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { canManageMatch, mvpRanking, playersOf, score } from '@/domain/rules';
import { act } from '@/ui/act';
import { Body, Button, Card, Empty, Eyebrow, HalfwayRule, Muted, Screen, Section } from '@/ui/kit';
import { colors, fonts, space, teamColor } from '@/ui/theme';

export default function MatchSummary() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const nameOf = usePlayerNames();
  const match = data.matches.find((m) => m.id === matchId);
  const session = data.sessions.find((s) => s.id === match?.sessionId);
  const group = data.groups.find((g) => g.id === match?.groupId);

  if (!match || !session || !group || !me) {
    return (
      <Screen>
        <Empty title="Ce match n'existe plus." />
      </Screen>
    );
  }

  const { a, b } = score(match);
  const five = match.format === 5;
  const ranking = mvpRanking(match);
  const present = playersOf(match);
  const manager = canManageMatch(group, session, me.id);
  const nameA = five ? 'Orange' : 'Nous';
  const nameB = five ? 'Bleu' : match.opponentName || 'Adversaire';

  return (
    <Screen>
      <View style={styles.board}>
        <View style={styles.side}>
          <Text style={[styles.sideName, { color: colors.teamA }]}>{nameA}</Text>
          <Text style={[styles.bigScore, { color: colors.teamA }]}>{a}</Text>
        </View>
        <Text style={styles.sep}>–</Text>
        <View style={styles.side}>
          <Text style={[styles.sideName, { color: five ? colors.teamB : colors.text }]} numberOfLines={1}>
            {nameB}
          </Text>
          <Text style={[styles.bigScore, { color: five ? colors.teamB : colors.text }]}>{b}</Text>
        </View>
      </View>

      <Section title={`MVP · ${match.voters.length}/${present.length} votes`}>
        {ranking.length === 0 ? (
          <Muted>Aucun vote pour l’instant.</Muted>
        ) : (
          ranking.slice(0, 5).map((r, i) => (
            <View key={r.playerId} style={styles.mvpRow}>
              <Text style={[styles.mvpRank, i === 0 && { color: colors.highlight }]}>{i + 1}</Text>
              <Body style={[{ flex: 1 }, i === 0 && styles.mvpTop]} numberOfLines={1}>
                {nameOf(r.playerId)}
              </Body>
              <Text style={[styles.mvpPts, i === 0 && { color: colors.highlight }]}>{r.points} pts</Text>
            </View>
          ))
        )}
        {match.status === 'finished' && match.voters.length < present.length && (
          <Button label="Voter pour les MVP" onPress={() => router.push({ pathname: '/match/[matchId]/vote', params: { matchId: match.id } })} />
        )}
      </Section>

      <HalfwayRule />

      <Section title={`Buts · ${match.goals.length}`}>
        {match.goals.length === 0 && <Muted>Aucun but.</Muted>}
        {match.goals.map((g) => (
          <Card key={g.id} style={[styles.goal, { borderLeftColor: g.scorerId ? teamColor(g.team) : colors.textMuted }]}>
            <Text style={styles.goalTime}>{formatTime(g.at)}</Text>
            <View style={{ flex: 1 }}>
              <Body style={{ fontFamily: fonts.bodySemi }}>{g.scorerId ? nameOf(g.scorerId) : `But ${nameB}`}</Body>
              {g.assistId && <Muted>Passe de {nameOf(g.assistId)}</Muted>}
            </View>
          </Card>
        ))}
      </Section>

      {five && (
        <View style={styles.teams}>
          {(['A', 'B'] as const).map((t) => (
            <View key={t} style={{ flex: 1, gap: space(1.5) }}>
              <Eyebrow style={{ color: teamColor(t) }}>{t === 'A' ? 'Orange' : 'Bleu'}</Eyebrow>
              {(t === 'A' ? match.teamA : match.teamB).map((id) => (
                <Body key={id} numberOfLines={1}>
                  {nameOf(id)}
                </Body>
              ))}
            </View>
          ))}
        </View>
      )}

      {manager && match.status === 'live' && (
        <Button label="Retour au match" onPress={() => router.replace({ pathname: '/match/[matchId]/live', params: { matchId: match.id } })} />
      )}
      {manager && match.status === 'finished' && (
        <Button
          variant="ghost"
          label="Rouvrir le match pour corriger"
          onPress={() => {
            act(async () => {
              await repo.resumeMatch(match.id);
              router.replace({ pathname: '/match/[matchId]/live', params: { matchId: match.id } });
            });
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(4), paddingVertical: space(4) },
  side: { alignItems: 'center', flex: 1 },
  sideName: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1.6, },
  bigScore: { fontFamily: fonts.displayBlack, fontSize: 110, lineHeight: 112 },
  sep: { fontFamily: fonts.display, fontSize: 48, color: colors.textMuted },
  mvpRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 40 },
  mvpRank: { fontFamily: fonts.displayBlack, fontSize: 28, width: 24, color: colors.textMuted },
  mvpTop: { fontFamily: fonts.display, fontSize: 26, color: colors.highlight },
  mvpPts: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  goal: { flexDirection: 'row', alignItems: 'center', gap: space(3), borderLeftWidth: 5, paddingVertical: space(3) },
  goalTime: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.textMuted, width: 48 },
  teams: { flexDirection: 'row', gap: space(4) },
});
