import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDay, formatTime, useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { hasPremium } from '@/domain/plan';
import { answerOf, canManageMatch, isAdmin, isCaptain, isComposed, isMember, lineup, score } from '@/domain/rules';
import type { ID, Match, Session } from '@/domain/types';
import { act } from '@/ui/act';
import { Alert } from '@/ui/dialog';
import { Body, Button, Card, Display, Empty, Eyebrow, HalfwayRule, Muted, Screen, Section, Tag, tap } from '@/ui/kit';
import { openPaywall } from '@/ui/premium';
import { colors, fonts, radius, space } from '@/ui/theme';

export default function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const nameOf = usePlayerNames();
  const session = data.sessions.find((s) => s.id === sessionId);
  const group = data.groups.find((g) => g.id === session?.groupId);

  if (!session || !group || !me) {
    return (
      <Screen>
        <Empty title="Ce match n'existe plus." />
      </Screen>
    );
  }

  const admin = isAdmin(group, me.id);
  const captain = isCaptain(session, me.id);
  const manager = canManageMatch(group, session, me.id);
  const premium = hasPremium(group);
  const open = session.status === 'open';
  const { confirmed, waiting } = lineup(session);
  const full = confirmed.length >= session.capacity;
  const answered = new Set([...session.registrations, ...session.declined]);
  const silent = group.members.map((m) => m.playerId).filter((id) => !answered.has(id));
  const needed = session.format === 5 ? 10 : 11;
  const matches = data.matches.filter((m) => m.sessionId === session.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const newMatch = async () => {
    if (!premium) return openPaywall(group.id);
    const id = await act(() => repo.createMatch(session.id));
    if (!id) return;
    router.push({ pathname: '/match/[matchId]/compo', params: { matchId: id } });
  };

  /** Local mode: an admin can record the answer of a player who replied elsewhere. */
  const answerFor = (id: ID) =>
    Alert.alert(nameOf(id), 'Réponse à l’invitation', [
      { text: 'Présent', onPress: () => act(() => repo.answer(session.id, id, 'in')) },
      { text: 'Absent', onPress: () => act(() => repo.answer(session.id, id, 'out')) },
      { text: 'Effacer la réponse', style: 'destructive', onPress: () => act(() => repo.answer(session.id, id, 'none')) },
      { text: 'Fermer', style: 'cancel' },
    ]);
  const onPlayer = admin && open ? answerFor : undefined;

  const confirmDelete = () =>
    Alert.alert('Supprimer ce match ?', 'L’invitation, les réponses et les scores seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          act(async () => {
            await repo.deleteSession(session.id);
            router.back();
          });
        },
      },
    ]);

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Eyebrow>
          {group.name} · Foot à {session.format}
        </Eyebrow>
        <Display>
          {formatDay(session.date)} · {formatTime(session.date)}
        </Display>
        {!!session.place && <Muted>{session.place}</Muted>}
        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
          {!open ? <Tag label="Invitation close" /> : full ? <Tag label="Complet" color={colors.highlight} /> : <Tag label="Invitation en cours" color={colors.highlight} />}
          {captain && <Tag label="Tu es capitaine" color={colors.highlight} />}
        </View>
      </View>

      {isMember(group, me.id) && <MyAnswer session={session} meId={me.id} open={open} />}

      <HalfwayRule />

      <Section title={`Inscrits · ${confirmed.length}/${session.capacity}`}>
        {confirmed.length === 0 ? <Muted>Personne n’a encore répondu présent.</Muted> : <PlayerList ids={confirmed} onPress={onPlayer} accent={colors.text} />}
      </Section>

      {waiting.length > 0 && (
        <Section title={`Liste d’attente · ${waiting.length}`}>
          <Muted>Le premier de la liste prend la place d’un inscrit qui se désiste.</Muted>
          <PlayerList ids={waiting} onPress={onPlayer} accent={colors.highlight} />
        </Section>
      )}

      {(session.declined.length > 0 || silent.length > 0) && (
        <Section title="Les autres">
          {session.declined.length > 0 && (
            <View style={{ gap: space(2) }}>
              <Muted>Absents</Muted>
              <PlayerList ids={session.declined} onPress={onPlayer} compact />
            </View>
          )}
          {silent.length > 0 && (
            <View style={{ gap: space(2) }}>
              <Muted>Pas encore répondu</Muted>
              <PlayerList ids={silent} onPress={onPlayer} compact />
            </View>
          )}
          {admin && open && <Muted style={{ fontSize: 12 }}>Touche un joueur pour noter sa réponse à sa place.</Muted>}
        </Section>
      )}

      <Section title="Capitaine">
        {session.captainId ? (
          <Body style={styles.captain}>{nameOf(session.captainId)}</Body>
        ) : (
          <Muted>{admin ? 'Choisis le capitaine parmi les inscrits : il fera les compos.' : 'Pas encore de capitaine désigné.'}</Muted>
        )}
        {admin && confirmed.length > 0 && (
          <View style={styles.chips}>
            {confirmed.map((id) => (
              <Button
                key={id}
                small
                variant={session.captainId === id ? 'primary' : 'ghost'}
                label={nameOf(id)}
                onPress={() => act(() => repo.setCaptain(session.id, session.captainId === id ? null : id))}
              />
            ))}
          </View>
        )}
      </Section>

      <Section title="Matchs">
        {matches.map((m, i) => (
          <MatchRow key={m.id} match={m} index={i + 1} manager={manager} />
        ))}
        {matches.length === 0 && (
          <Muted>
            {manager
              ? `Quand les ${needed} joueurs sont inscrits, prépare le match et fais la compo.`
              : 'Le capitaine prépare la compo du prochain match.'}
          </Muted>
        )}
        {manager && (
          <Button
            label={!premium ? 'Compos : abonnement requis' : matches.length ? 'Préparer un autre match' : 'Préparer le match'}
            variant={matches.length || !premium ? 'ghost' : 'primary'}
            disabled={premium && confirmed.length < needed}
            onPress={newMatch}
          />
        )}
        {manager && premium && confirmed.length < needed && (
          <Muted>
            Il manque {needed - confirmed.length} inscrit{needed - confirmed.length > 1 ? 's' : ''} pour composer.
          </Muted>
        )}
      </Section>

      {admin && (
        <Section title="Gestion">
          <View style={styles.capacityRow}>
            <Body style={{ flex: 1 }}>Places</Body>
            <Button small variant="ghost" label="−" disabled={session.capacity <= 1} onPress={() => act(() => repo.setCapacity(session.id, session.capacity - 1))} style={styles.stepBtn} />
            <Text style={styles.capacity}>{session.capacity}</Text>
            <Button small variant="ghost" label="+" onPress={() => act(() => repo.setCapacity(session.id, session.capacity + 1))} style={styles.stepBtn} />
          </View>
          <Button
            variant="ghost"
            label={open ? 'Clore l’invitation' : 'Rouvrir l’invitation'}
            onPress={() => act(() => repo.setSessionStatus(session.id, open ? 'closed' : 'open'))}
          />
          <Button variant="ghost" label="Supprimer ce match" onPress={confirmDelete} style={{ borderColor: colors.danger }} />
        </Section>
      )}
    </Screen>
  );
}

function MyAnswer({ session, meId, open }: { session: Session; meId: ID; open: boolean }) {
  const answer = answerOf(session, meId);
  const position = session.registrations.indexOf(meId) + 1;
  const status =
    answer === 'in'
      ? `Tu es inscrit · place ${position}/${session.capacity}`
      : answer === 'waiting'
        ? `Liste d’attente · ${position - session.capacity}${position - session.capacity === 1 ? 'er' : 'e'}`
        : answer === 'out'
          ? 'Tu as répondu absent'
          : 'Tu n’as pas encore répondu';
  const color = answer === 'in' ? colors.primary : answer === 'waiting' ? colors.highlight : colors.textMuted;

  return (
    <Card style={{ gap: space(3), borderColor: answer === 'none' && open ? colors.highlight : colors.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Body style={{ fontFamily: fonts.bodySemi, flex: 1 }}>{status}</Body>
      </View>
      {open ? (
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <Button
            style={{ flex: 1 }}
            variant={answer === 'in' || answer === 'waiting' ? 'primary' : 'ghost'}
            label="Présent"
            onPress={() => answer !== 'in' && answer !== 'waiting' && act(() => repo.answer(session.id, meId, 'in'))}
          />
          <Button
            style={{ flex: 1 }}
            variant={answer === 'out' ? 'dark' : 'ghost'}
            label="Absent"
            onPress={() => {
              if (answer === 'in' && session.registrations.length > session.capacity) {
                Alert.alert('Libérer ta place ?', 'Le premier de la liste d’attente prendra ta place. Si tu reviens, tu repasseras derrière.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Libérer ma place', style: 'destructive', onPress: () => act(() => repo.answer(session.id, meId, 'out')) },
                ]);
              } else if (answer !== 'out') {
                act(() => repo.answer(session.id, meId, 'out'));
              }
            }}
          />
        </View>
      ) : (
        <Muted>L’invitation est close.</Muted>
      )}
    </Card>
  );
}

function PlayerList({ ids, onPress, accent, compact }: { ids: ID[]; onPress?: (id: ID) => void; accent?: string; compact?: boolean }) {
  const nameOf = usePlayerNames();
  return (
    <View style={styles.list}>
      {ids.map((id, i) => (
        <Pressable
          key={id}
          accessibilityRole={onPress ? 'button' : 'text'}
          pressRetentionOffset={24}
          disabled={!onPress}
          onPress={() => {
            tap();
            onPress?.(id);
          }}
          style={({ pressed }) => [styles.player, compact && styles.playerCompact, pressed && { backgroundColor: colors.surfacePressed }]}>
          {!compact && <Text style={[styles.order, { color: accent }]}>{i + 1}</Text>}
          <Text style={[styles.playerName, compact && { color: colors.textMuted, flex: 0 }]} numberOfLines={1}>
            {nameOf(id)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MatchRow({ match, index, manager }: { match: Match; index: number; manager: boolean }) {
  const { a, b } = score(match);
  const ready = isComposed(match);
  const start = () =>
    act(async () => {
      await repo.startMatch(match.id);
      router.push({ pathname: '/match/[matchId]/live', params: { matchId: match.id } });
    });
  const status = match.status === 'draft' ? (ready ? 'Compo prête' : 'Compo en cours') : match.status === 'live' ? 'En direct' : 'Terminé';
  const target = match.status === 'draft' ? '/match/[matchId]/compo' : match.status === 'live' ? '/match/[matchId]/live' : '/match/[matchId]';
  return (
    <Card onPress={() => router.push({ pathname: target, params: { matchId: match.id } })} style={styles.matchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Eyebrow>Match {index}</Eyebrow>
        <Body>{status}</Body>
        {match.status === 'draft' && manager && ready && (
          <Button label="Lancer le match" onPress={start} style={{ marginTop: space(2) }} />
        )}
      </View>
      {match.status !== 'draft' && (
        <View style={styles.score}>
          <Display style={[styles.scoreNum, { color: colors.teamA }]}>{a}</Display>
          <Display style={styles.scoreDash}>–</Display>
          <Display style={[styles.scoreNum, { color: match.format === 5 ? colors.teamB : colors.text }]}>{b}</Display>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  captain: { fontFamily: fonts.display, fontSize: 28, color: colors.text, },
  dot: { width: 10, height: 10, borderRadius: 5 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  player: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 44,
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  playerCompact: { flexBasis: 'auto', flexGrow: 0, minHeight: 36, backgroundColor: 'transparent' },
  order: { fontFamily: fonts.display, fontSize: 18, width: 20 },
  playerName: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  matchRow: { flexDirection: 'row', alignItems: 'center' },
  score: { flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) },
  scoreNum: { fontSize: 36, lineHeight: 38 },
  scoreDash: { fontSize: 24, color: colors.textMuted },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  stepBtn: { width: 44 },
  capacity: { fontFamily: fonts.displayBlack, fontSize: 28, color: colors.text, minWidth: 36, textAlign: 'center' },
});
