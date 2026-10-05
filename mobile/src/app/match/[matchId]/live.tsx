import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { hasPremium } from '@/domain/plan';
import { canManageMatch, isAdmin, score } from '@/domain/rules';
import type { Goal, ID, Match, Team } from '@/domain/types';
import { act } from '@/ui/act';
import { Alert } from '@/ui/dialog';
import { Button, Empty, Screen, tap } from '@/ui/kit';
import { Locked } from '@/ui/premium';
import { colors, fonts, radius, space, teamColor } from '@/ui/theme';

export default function Live() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const match = data.matches.find((m) => m.id === matchId);
  const session = data.sessions.find((s) => s.id === match?.sessionId);
  const group = data.groups.find((g) => g.id === match?.groupId);

  const [correcting, setCorrecting] = useState(false);
  const [pendingGoal, setPendingGoal] = useState<Goal | null>(null);
  const lastTouchRef = useRef({ key: '', at: 0 });

  const premium = !!group && hasPremium(group);

  useEffect(() => {
    if (!premium) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [premium]);

  if (!match || !session || !group || !me) {
    return (
      <Screen>
        <Empty title="Ce match n'existe plus." />
      </Screen>
    );
  }

  if (!premium) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Locked group={group} admin={isAdmin(group, me.id)} />
        <Button variant="ghost" label="Retour" onPress={() => router.back()} />
      </Screen>
    );
  }

  const canScore = canManageMatch(group, session, me.id) && match.status === 'live';
  const five = match.format === 5;

  // Goals count as soon as the finger lands (sweaty hands, gloves, on the move);
  // a second touch on the same tile within half a second is a bounce, not a goal.
  const lastTouch = lastTouchRef;
  const isBounce = (key: string) => {
    const now = Date.now();
    const bounce = lastTouch.current.key === key && now - lastTouch.current.at < 500;
    lastTouch.current = { key, at: now };
    return bounce;
  };

  const onPlayer = (playerId: ID, team: Team) => {
    if (isBounce(playerId)) return;
    if (!canScore) return;
    if (correcting) {
      const last = [...match.goals].reverse().find((g) => g.scorerId === playerId);
      if (!last) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      act(() => repo.removeGoal(match.id, last.id), 'Correction non enregistrée');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const goal = repo.addGoal(match.id, team, playerId);
    act(() => goal.done, 'But non enregistré');
    setPendingGoal({ id: goal.id, team, scorerId: playerId, assistId: null, at: new Date().toISOString() });
  };

  const onOpponent = () => {
    if (isBounce('opponent')) return;
    if (!canScore) return;
    if (correcting) {
      const last = [...match.goals].reverse().find((g) => g.team === 'B');
      if (last) act(() => repo.removeGoal(match.id, last.id), 'Correction non enregistrée');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    act(() => repo.addGoal(match.id, 'B', null).done, 'But non enregistré');
  };

  const finish = () =>
    Alert.alert('Terminer le match ?', 'Le score sera figé et les joueurs pourront voter pour les MVP.', [
      { text: 'Continuer le match', style: 'cancel' },
      {
        text: 'Terminer',
        onPress: () =>
          act(async () => {
            await repo.finishMatch(match.id);
            router.replace({ pathname: '/match/[matchId]/vote', params: { matchId: match.id } });
          }),
      },
    ]);

  return (
    <View style={styles.root}>
      <Mowing />
      <SafeAreaView style={styles.pitch} edges={['left', 'right', 'top', 'bottom']}>
        <View style={styles.outline}>
          <TeamHalf match={match} team="A" correcting={correcting} disabled={!canScore} onPress={onPlayer} />

          <CenterStrip
            match={match}
            canScore={canScore}
            correcting={correcting}
            onToggleCorrect={() => setCorrecting((c) => !c)}
            onFinish={finish}
          />

          {five ? (
            <TeamHalf match={match} team="B" correcting={correcting} disabled={!canScore} onPress={onPlayer} />
          ) : (
            <OpponentHalf name={match.opponentName || 'Adversaire'} goals={score(match).b} correcting={correcting} disabled={!canScore} onPress={onOpponent} />
          )}
        </View>
      </SafeAreaView>

      <AssistPrompt
        match={match}
        goal={pendingGoal}
        onPick={(assistId) => {
          if (pendingGoal) act(() => repo.setAssist(match.id, pendingGoal.id, assistId), 'Passe non enregistrée');
          setPendingGoal(null);
        }}
        onCancel={() => {
          if (pendingGoal) act(() => repo.removeGoal(match.id, pendingGoal.id), 'Annulation non enregistrée');
          setPendingGoal(null);
        }}
      />
    </View>
  );
}

/** Alternating mowing bands, the texture of a real pitch. */
function Mowing() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? colors.pitch : colors.pitchStripe }} />
        ))}
      </View>
    </View>
  );
}

function TeamHalf({
  match,
  team,
  correcting,
  disabled,
  onPress,
}: {
  match: Match;
  team: Team;
  correcting: boolean;
  disabled: boolean;
  onPress: (id: ID, team: Team) => void;
}) {
  const nameOf = usePlayerNames();
  const ids = team === 'A' ? match.teamA : match.teamB;
  const color = teamColor(team);
  const twoCols = ids.length > 6;

  return (
    <View style={[styles.half, twoCols && styles.halfWide]}>
      <View style={[styles.tiles, twoCols && { flexDirection: 'row', flexWrap: 'wrap' }]}>
        {ids.map((id) => {
          const goals = match.goals.filter((g) => g.scorerId === id).length;
          const assists = match.goals.filter((g) => g.assistId === id).length;
          const canRemove = correcting && goals > 0;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={correcting ? `Retirer un but à ${nameOf(id)}` : `But de ${nameOf(id)}`}
              disabled={disabled || (correcting && goals === 0)}
              onPressIn={() => onPress(id, team)}
              style={({ pressed }) => [
                styles.tile,
                twoCols && { width: '48.5%', flexGrow: 0, flexBasis: '48.5%' },
                pressed && { backgroundColor: color },
                correcting && !canRemove && { opacity: 0.35 },
                canRemove && { borderStyle: 'dashed', borderColor: colors.danger },
              ]}>
              {({ pressed }) => (
                <>
                  <View style={[styles.tileBib, { backgroundColor: color }]} />
                  <Text style={[styles.tileName, pressed && { color: colors.onFill }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {nameOf(id)}
                  </Text>
                  {canRemove ? (
                    <Text style={styles.minus}>−1</Text>
                  ) : (
                    <View style={styles.tally}>
                      {goals > 0 && <Text style={[styles.tallyGoals, { color: pressed ? colors.onFill : color }]}>{goals}</Text>}
                      {assists > 0 && <Text style={[styles.tallyAssists, pressed && { color: colors.onFill }]}>{assists} pd</Text>}
                    </View>
                  )}
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OpponentHalf({ name, goals, correcting, disabled, onPress }: { name: string; goals: number; correcting: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <View style={styles.half}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={correcting ? 'Retirer un but adverse' : 'But adverse'}
        disabled={disabled || (correcting && goals === 0)}
        onPressIn={onPress}
        style={({ pressed }) => [styles.tile, styles.opponent, pressed && { backgroundColor: colors.text }, correcting && goals > 0 && { borderColor: colors.danger, borderStyle: 'dashed' }]}>
        <Text style={styles.opponentName} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.opponentHint}>{correcting ? '−1 but adverse' : 'Touche pour un but adverse'}</Text>
      </Pressable>
    </View>
  );
}

function CenterStrip({
  match,
  canScore,
  correcting,
  onToggleCorrect,
  onFinish,
}: {
  match: Match;
  canScore: boolean;
  correcting: boolean;
  onToggleCorrect: () => void;
  onFinish: () => void;
}) {
  const { a, b } = score(match);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = match.startedAt ? Math.max(0, now - new Date(match.startedAt).getTime()) : 0;
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');

  return (
    <View style={styles.center}>
      <View style={styles.halfwayLine} pointerEvents="none" />
      <View style={styles.centerCircle} pointerEvents="none" />

      <Pressable accessibilityRole="button" accessibilityLabel="Quitter l’écran du match" onPress={() => router.back()} hitSlop={10} style={styles.leave}>
        <Text style={styles.leaveLabel}>‹ Quitter</Text>
      </Pressable>

      <View style={styles.scoreboard} accessibilityLabel={`Score ${a} à ${b}`}>
        <Text style={[styles.score, { color: colors.teamA }]}>{a}</Text>
        <Text style={styles.scoreSep}>:</Text>
        <Text style={[styles.score, { color: match.format === 5 ? colors.teamB : colors.text }]}>{b}</Text>
      </View>
      <Text style={styles.clock}>
        {mm}:{ss}
      </Text>

      {canScore && (
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: correcting }}
            onPress={() => {
              tap();
              onToggleCorrect();
            }}
            style={[styles.control, correcting && { backgroundColor: colors.danger, borderColor: colors.danger }]}>
            <Text style={[styles.controlLabel, correcting && { color: colors.onFill }]}>{correcting ? 'Corrections : on' : 'Corriger'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tap();
              onFinish();
            }}
            style={[styles.control, { backgroundColor: colors.text, borderColor: colors.text }]}>
            <Text style={[styles.controlLabel, { color: colors.onFill }]}>Terminer</Text>
          </Pressable>
        </View>
      )}
      {correcting && <Text style={styles.correctHint}>Touche un buteur pour lui retirer un but</Text>}
    </View>
  );
}

function AssistPrompt({
  match,
  goal,
  onPick,
  onCancel,
}: {
  match: Match;
  goal: Goal | null;
  onPick: (assistId: ID | null) => void;
  onCancel: () => void;
}) {
  const nameOf = usePlayerNames();
  if (!goal) return null;
  const mates = (goal.team === 'A' ? match.teamA : match.teamB).filter((id) => id !== goal.scorerId);
  const color = teamColor(goal.team);

  return (
    <Modal transparent animationType="fade" visible supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { borderColor: color }]}>
          <Text style={styles.sheetEyebrow}>But de</Text>
          <Text style={[styles.sheetTitle, { color }]}>{nameOf(goal.scorerId)}</Text>
          <Text style={styles.sheetQuestion}>Qui a fait la passe décisive ?</Text>
          <View style={styles.mates}>
            {mates.map((id) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => {
                  tap();
                  onPick(id);
                }}
                style={({ pressed }) => [styles.mate, { borderColor: color }, pressed && { backgroundColor: color }]}>
                <Text style={styles.mateLabel} numberOfLines={1}>
                  {nameOf(id)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.control, { borderColor: colors.danger }]}>
              <Text style={[styles.controlLabel, { color: colors.danger }]}>Annuler le but</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onPick(null)}
              style={[styles.control, { backgroundColor: colors.text, borderColor: colors.text }]}>
              <Text style={[styles.controlLabel, { color: colors.onFill }]}>Sans passeur</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CHALK = 'rgba(255, 255, 255, 0.75)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pitch },
  pitch: { flex: 1 },
  outline: {
    flex: 1,
    flexDirection: 'row',
    margin: space(1),
    borderWidth: 2,
    borderColor: CHALK,
    borderRadius: 4,
  },
  half: { flex: 1, padding: space(1) },
  halfWide: { flex: 1.25 },
  tiles: { flex: 1, gap: 4 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  tileBib: { width: 6, alignSelf: 'stretch', marginVertical: space(1.5), borderRadius: 3 },
  tileName: { flex: 1, fontFamily: fonts.display, fontSize: 32, color: colors.text, letterSpacing: 0.5 },
  tally: { flexDirection: 'row', alignItems: 'baseline', gap: space(2) },
  tallyGoals: { fontFamily: fonts.displayBlack, fontSize: 28 },
  tallyAssists: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted },
  minus: { fontFamily: fonts.displayBlack, fontSize: 26, color: colors.danger },
  opponent: { flexDirection: 'column', justifyContent: 'center', borderColor: CHALK, gap: space(2) },
  opponentName: { fontFamily: fonts.displayBlack, fontSize: 36, color: colors.text, textAlign: 'center' },
  opponentHint: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
  center: { width: 160, alignItems: 'center', justifyContent: 'center', gap: space(1) },
  halfwayLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: CHALK },
  centerCircle: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: CHALK },
  leave: { position: 'absolute', top: space(2), paddingHorizontal: space(2), paddingVertical: space(1), backgroundColor: colors.surface, borderRadius: radius.sm },
  leaveLabel: { fontFamily: fonts.bodySemi, color: colors.textMuted, fontSize: 13 },
  scoreboard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: space(3), borderRadius: radius.lg },
  score: { fontFamily: fonts.displayBlack, fontSize: 64, lineHeight: 70, minWidth: 42, textAlign: 'center' },
  scoreSep: { fontFamily: fonts.display, fontSize: 44, color: colors.textMuted, marginTop: -6 },
  clock: { fontFamily: fonts.displayMedium, fontSize: 22, color: colors.onFill, paddingHorizontal: space(2), letterSpacing: 2 },
  controls: { position: 'absolute', bottom: space(2), left: space(2), right: space(2), gap: space(1.5) },
  control: { minHeight: 40, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(3), backgroundColor: colors.surface },
  controlLabel: { fontFamily: fonts.display, fontSize: 17, color: colors.text, letterSpacing: 0.8 },
  correctHint: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, textAlign: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: space(1) },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  sheet: { width: '100%', maxWidth: 620, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 2, padding: space(4), gap: space(2) },
  sheetEyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.6, color: colors.textMuted, },
  sheetTitle: { fontFamily: fonts.displayBlack, fontSize: 40, lineHeight: 42, },
  sheetQuestion: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  mates: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) },
  mate: { flexGrow: 1, flexBasis: '22%', minHeight: 52, borderWidth: 2, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(2) },
  mateLabel: { fontFamily: fonts.display, fontSize: 20, color: colors.text, },
  sheetActions: { flexDirection: 'row', gap: space(2), marginTop: space(2), justifyContent: 'flex-end' },
});
