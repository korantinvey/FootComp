import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatTime, useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { canManageMatch, mvpRanking, playersOf } from '@/domain/rules';
import { act } from '@/ui/act';
import { Alert } from '@/ui/dialog';
import { canShareCard, MatchCard, shareCard } from '@/ui/match-card';
import { Body, Button, Card, Empty, Eyebrow, HalfwayRule, Muted, Screen, Section } from '@/ui/kit';
import { colors, fonts, space, teamColor } from '@/ui/theme';

export default function MatchSummary() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const nameOf = usePlayerNames();
  const cardRef = useRef<View>(null);
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

  const five = match.format === 5;
  const ranking = mvpRanking(match);
  const present = playersOf(match);
  const manager = canManageMatch(group, session, me.id);
  const voteOver = match.votesClosed || match.voters.length >= present.length;
  const nameB = five ? 'Bleu' : match.opponentName || 'Adversaire';

  return (
    <Screen>
      <MatchCard ref={cardRef} match={match} session={session} group={group} nameOf={nameOf} />
      {canShareCard && match.status === 'finished' && voteOver && (
        <Button
          label="Partager le résultat"
          onPress={() => cardRef.current && act(() => shareCard(cardRef.current!), 'Partage impossible')}
        />
      )}
      {match.status === 'finished' && !voteOver && (
        <Muted>
          Le résultat se partage une fois le vote MVP terminé : {match.voters.length}/{present.length} joueurs ont voté.
        </Muted>
      )}
      {match.status === 'finished' && !voteOver && manager && (
        <Button
          variant="ghost"
          label="Clore le vote"
          onPress={() =>
            Alert.alert('Clore le vote ?', 'Les joueurs qui n’ont pas voté ne pourront plus le faire. Le MVP sera calculé avec les votes reçus.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Clore le vote', onPress: () => act(() => repo.closeVotes(match.id)) },
            ])
          }
        />
      )}

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
  mvpRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 40 },
  mvpRank: { fontFamily: fonts.displayBlack, fontSize: 28, width: 24, color: colors.textMuted },
  mvpTop: { fontFamily: fonts.display, fontSize: 26, color: colors.highlight },
  mvpPts: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  goal: { flexDirection: 'row', alignItems: 'center', gap: space(3), borderLeftWidth: 5, paddingVertical: space(3) },
  goalTime: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.textMuted, width: 48 },
  teams: { flexDirection: 'row', gap: space(4) },
});
