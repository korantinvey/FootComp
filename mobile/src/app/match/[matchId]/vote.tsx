import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage, useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { hasPremium } from '@/domain/plan';
import { canManageMatch, isAdmin, MVP_POINTS, playersOf, teamOf, validateVote } from '@/domain/rules';
import { Alert } from '@/ui/dialog';
import { Locked } from '@/ui/premium';
import type { ID } from '@/domain/types';
import { Body, Button, Card, Display, Empty, Eyebrow, Muted, Screen, Section, tap } from '@/ui/kit';
import { colors, fonts, radius, space, teamColor } from '@/ui/theme';

const RANK_LABEL = ['Top 1', 'Top 2', 'Top 3'];

/**
 * Each player votes from their own phone. The captain or an admin can also
 * record the ballot of players who have no account (no smartphone).
 */
export default function Vote() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const data = useData();
  const nameOf = usePlayerNames();
  const me = useCurrentPlayer();
  const match = data.matches.find((m) => m.id === matchId);
  const group = data.groups.find((g) => g.id === match?.groupId);
  const [voterId, setVoterId] = useState<ID | null>(null);
  const [picks, setPicks] = useState<ID[]>([]);

  if (!match || !group) {
    return (
      <Screen>
        <Empty title="Ce match n'existe plus." />
      </Screen>
    );
  }

  if (!hasPremium(group)) {
    return (
      <Screen>
        <Locked group={group} admin={isAdmin(group, me?.id ?? null)} />
      </Screen>
    );
  }

  const present = playersOf(match);
  const voted = new Set(match.voters);
  const session = data.sessions.find((s) => s.id === match.sessionId);
  const manager = canManageMatch(group, session, me?.id ?? null);
  const hasAccount = (id: ID) => data.players.find((p) => p.id === id)?.hasAccount ?? false;
  const waiting = present.filter((id) => !voted.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  // Ballots this phone may cast: mine, plus players without account for a manager.
  const mine = waiting.filter((id) => id === me?.id || (manager && !hasAccount(id)));
  const elsewhere = waiting.filter((id) => !mine.includes(id));
  const goSummary = () => router.replace({ pathname: '/match/[matchId]', params: { matchId: match.id } });

  if (match.status !== 'finished') {
    return (
      <Screen>
        <Empty title="Le vote ouvre à la fin du match." />
      </Screen>
    );
  }

  if (match.votesClosed) {
    return (
      <Screen>
        <Empty title="Le vote est clos">
          <Muted>Le capitaine a clos le vote MVP de ce match.</Muted>
          <Button label="Voir le résultat" onPress={goSummary} />
        </Empty>
      </Screen>
    );
  }

  if (!voterId) {
    return (
      <Screen>
        <View style={{ gap: space(2) }}>
          <Eyebrow>
            {voted.size}/{present.length} votes
          </Eyebrow>
          <Display>Votes MVP</Display>
          <Muted>Chaque joueur du match désigne son top 3 depuis son téléphone. On ne vote pas pour soi.</Muted>
        </View>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${(voted.size / present.length) * 100}%` }]} />
        </View>

        {waiting.length === 0 ? (
          <Empty title="Tout le monde a voté">
            <Button label="Voir le podium" onPress={goSummary} />
          </Empty>
        ) : (
          <Section title={mine.length ? 'À toi de voter' : 'Pas encore voté'}>
            {mine.length > 1 && <Muted>Tu peux aussi voter pour les joueurs sans l’app : choisis le votant.</Muted>}
            <View style={styles.grid}>
              {mine.map((id) => {
                const team = teamOf(match, id);
                return (
                  <Card key={id} style={[styles.voterCard, team && { borderLeftColor: teamColor(team) }]} onPress={() => setVoterId(id)}>
                    <Body style={{ fontFamily: fonts.bodySemi }} numberOfLines={1}>
                      {id === me?.id ? 'Mon vote' : nameOf(id)}
                    </Body>
                  </Card>
                );
              })}
            </View>
            {elsewhere.length > 0 && (
              <Muted>
                En attente sur leur téléphone : {elsewhere.map((id) => nameOf(id)).join(', ')}.
              </Muted>
            )}
          </Section>
        )}

        {waiting.length > 0 && <Button variant="ghost" label="Voir le résultat provisoire" onPress={goSummary} />}
      </Screen>
    );
  }

  const candidates = present.filter((id) => id !== voterId).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const toggle = (id: ID) => {
    tap();
    if (picks.includes(id)) setPicks(picks.filter((p) => p !== id));
    else if (picks.length < 3) setPicks([...picks, id]);
  };

  const submit = async () => {
    const error = validateVote(match, voterId, picks);
    if (error) return Alert.alert('Vote refusé', error);
    try {
      await repo.castVote(match.id, voterId, picks as [ID, ID, ID]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setVoterId(null);
      setPicks([]);
    } catch (e) {
      Alert.alert('Vote refusé', errorMessage(e));
    }
  };

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Eyebrow>Vote de</Eyebrow>
        <Display>{nameOf(voterId)}</Display>
        <Muted>Touche tes joueurs dans l’ordre : le premier choisi est ton top 1.</Muted>
      </View>

      <View style={styles.podium}>
        {[1, 0, 2].map((rank) => {
          const id = picks[rank];
          return (
            <View key={rank} style={[styles.step, { height: [128, 104, 88][rank] }, id && styles.stepFilled]}>
              <Text style={[styles.stepPts, id && { color: colors.onFill }]}>+{MVP_POINTS[rank]}</Text>
              <Text style={[styles.stepName, id && { color: colors.onFill }]} numberOfLines={1}>
                {id ? nameOf(id) : RANK_LABEL[rank]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.grid}>
        {candidates.map((id) => {
          const rank = picks.indexOf(id);
          const on = rank >= 0;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={on ? `${nameOf(id)}, ${RANK_LABEL[rank]}` : nameOf(id)}
              onPress={() => toggle(id)}
              style={[styles.pick, on && styles.pickOn]}>
              <Text style={[styles.pickName, on && { color: colors.onFill }]} numberOfLines={1}>
                {nameOf(id)}
              </Text>
              {on && <Text style={styles.pickRank}>{rank + 1}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: space(3) }}>
        <Button label="Valider mon vote" disabled={picks.length !== 3} onPress={submit} />
        <Button
          variant="ghost"
          label="Ce n’est pas moi"
          onPress={() => {
            setVoterId(null);
            setPicks([]);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.surfacePressed, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.highlight },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  voterCard: { flexBasis: '47%', flexGrow: 1, borderLeftWidth: 5 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2) },
  step: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    padding: space(2),
    justifyContent: 'space-between',
  },
  stepFilled: { backgroundColor: colors.highlight, borderColor: colors.highlight, borderStyle: 'solid' },
  stepPts: { fontFamily: fonts.displayBlack, fontSize: 28, color: colors.textMuted },
  stepName: { fontFamily: fonts.display, fontSize: 18, color: colors.textMuted, },
  pick: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(3),
    gap: space(2),
  },
  pickOn: { backgroundColor: colors.highlight, borderColor: colors.highlight },
  pickName: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  pickRank: { fontFamily: fonts.displayBlack, fontSize: 26, color: colors.onFill },
});
