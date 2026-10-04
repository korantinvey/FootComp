import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { balanceTeams } from '@/domain/balance';
import { hasPremium } from '@/domain/plan';
import { canManageMatch, isAdmin, lineup } from '@/domain/rules';
import { computeStats } from '@/domain/stats';
import type { ID, Team } from '@/domain/types';
import { act } from '@/ui/act';
import { Alert } from '@/ui/dialog';
import { Body, Button, Card, Empty, Field, Muted, Screen, Section, tap } from '@/ui/kit';
import { Locked } from '@/ui/premium';
import { colors, fonts, radius, space, teamColor } from '@/ui/theme';

export default function Compo() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const nameOf = usePlayerNames();
  const match = data.matches.find((m) => m.id === matchId);
  const session = data.sessions.find((s) => s.id === match?.sessionId);
  const group = data.groups.find((g) => g.id === match?.groupId);

  const [teamA, setTeamA] = useState<ID[]>(match?.teamA ?? []);
  const [teamB, setTeamB] = useState<ID[]>(match?.teamB ?? []);
  const [opponent, setOpponent] = useState(match?.opponentName ?? '');

  if (!match || !session || !group || !me) {
    return (
      <Screen>
        <Empty title="Ce match n'existe plus." />
      </Screen>
    );
  }

  if (!hasPremium(group)) {
    return (
      <Screen>
        <Locked group={group} admin={isAdmin(group, me.id)} />
      </Screen>
    );
  }

  const editable = canManageMatch(group, session, me.id) && match.status === 'draft';
  const five = match.format === 5;
  const size = match.format;
  const pool = [...lineup(session).confirmed].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const ready = five ? teamA.length === size && teamB.length === size : teamA.length === size;

  const assign = (id: ID, team: Team) => {
    const inTeam = team === 'A' ? teamA : teamB;
    if (inTeam.includes(id)) {
      if (team === 'A') setTeamA(teamA.filter((x) => x !== id));
      else setTeamB(teamB.filter((x) => x !== id));
      return;
    }
    if (inTeam.length >= size) {
      Alert.alert('Équipe complète', `Une équipe compte ${size} joueurs. Retire quelqu’un avant d’en ajouter un autre.`);
      return;
    }
    if (team === 'A') {
      setTeamA([...teamA, id]);
      setTeamB(teamB.filter((x) => x !== id));
    } else {
      setTeamB([...teamB, id]);
      setTeamA(teamA.filter((x) => x !== id));
    }
  };

  /** Splits the registered players into two teams of equal level, from the group stats. */
  const balance = () => {
    const stats = computeStats(data.matches.filter((m) => m.groupId === group.id), pool);
    const [a, b] = balanceTeams(pool, stats, size);
    setTeamA(a);
    setTeamB(b);
  };

  const shuffle = () => {
    const ids = [...pool].sort(() => Math.random() - 0.5);
    setTeamA(ids.slice(0, size));
    setTeamB(five ? ids.slice(size, size * 2) : []);
  };

  const save = () => repo.setTeams(match.id, teamA, five ? teamB : [], opponent);

  const start = () =>
    act(async () => {
      await save();
      await repo.startMatch(match.id);
      router.replace({ pathname: '/match/[matchId]/live', params: { matchId: match.id } });
    });

  const remove = () =>
    Alert.alert('Supprimer ce match ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          act(async () => {
            await repo.deleteMatch(match.id);
            router.back();
          }),
      },
    ]);

  return (
    <Screen>
      <View style={styles.counters}>
        <Counter team="A" count={teamA.length} size={size} label={five ? 'Orange' : 'Mon équipe'} />
        {five && <Counter team="B" count={teamB.length} size={size} label="Bleu" />}
      </View>

      {!editable && <Muted>Seul le capitaine (ou un admin) peut modifier la compo.</Muted>}
      {editable && (
        <Muted>
          {five
            ? 'Place chaque joueur dans l’équipe orange ou bleue. Touche à nouveau pour le retirer.'
            : `Choisis les ${size} joueurs de ton équipe.`}
        </Muted>
      )}

      {!five && (
        <Field label="Adversaire" placeholder="Ex. AS Montreuil" value={opponent} onChangeText={setOpponent} editable={editable} />
      )}

      <Section
        title={`Inscrits · ${pool.length}`}
        action={
          editable && (
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              {five && <Button small label="Équilibrer" onPress={balance} />}
              <Button small variant="ghost" label="Au hasard" onPress={shuffle} />
            </View>
          )
        }>
        {editable && five && (
          <Muted style={{ fontSize: 13 }}>« Équilibrer » répartit les joueurs selon leurs stats (victoires, buts, passes, MVP) pour des équipes de même niveau.</Muted>
        )}
        {pool.map((id) => {
          const team: Team | null = teamA.includes(id) ? 'A' : teamB.includes(id) ? 'B' : null;
          return (
            <Card key={id} style={[styles.row, team && { borderColor: teamColor(team) }]}>
              <View style={[styles.stripe, { backgroundColor: team ? teamColor(team) : 'transparent' }]} />
              <Body style={{ flex: 1 }} numberOfLines={1}>
                {nameOf(id)}
                {id === session.captainId ? '  (C)' : ''}
              </Body>
              <BibToggle on={team === 'A'} team="A" label={five ? 'Orange' : 'Titulaire'} disabled={!editable} onPress={() => assign(id, 'A')} />
              {five && <BibToggle on={team === 'B'} team="B" label="Bleu" disabled={!editable} onPress={() => assign(id, 'B')} />}
            </Card>
          );
        })}
      </Section>

      {editable && (
        <View style={{ gap: space(3) }}>
          <Button label="Lancer le match" disabled={!ready} onPress={start} />
          <Button variant="ghost" label="Enregistrer la compo" onPress={() => act(async () => { await save(); router.back(); })} />
          <Button variant="ghost" label="Supprimer ce match" onPress={remove} style={{ borderColor: colors.danger }} />
        </View>
      )}
    </Screen>
  );
}

function Counter({ team, count, size, label }: { team: Team; count: number; size: number; label: string }) {
  const full = count === size;
  return (
    <View style={[styles.counter, { borderColor: teamColor(team) }, full && { backgroundColor: teamColor(team) }]}>
      <Text style={[styles.counterLabel, full && { color: colors.onFill }]}>{label}</Text>
      <Text style={[styles.counterNum, full && { color: colors.onFill }]}>
        {count}
        <Text style={{ fontSize: 22 }}>/{size}</Text>
      </Text>
    </View>
  );
}

function BibToggle({ on, team, label, disabled, onPress }: { on: boolean; team: Team; label: string; disabled: boolean; onPress: () => void }) {
  const c = teamColor(team);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={6}
      style={[styles.bib, { borderColor: c }, on && { backgroundColor: c }, disabled && !on && { opacity: 0.3 }]}>
      <Text style={[styles.bibLabel, { color: on ? colors.onFill : c }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  counters: { flexDirection: 'row', gap: space(3) },
  counter: { flex: 1, borderWidth: 2, borderRadius: radius.lg, padding: space(3), gap: 2 },
  counterLabel: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.4, color: colors.text },
  counterNum: { fontFamily: fonts.displayBlack, fontSize: 44, lineHeight: 46, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(2.5), overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  bib: { minWidth: 72, height: 36, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  bibLabel: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 0.8 },
});
