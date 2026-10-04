import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePlayerNames } from '@/data/hooks';
import { useData } from '@/data/store';
import { hasPremium } from '@/domain/plan';
import { playerProfile, type Outcome } from '@/domain/profile';
import { isAdmin } from '@/domain/rules';
import { computeStats } from '@/domain/stats';
import { Card, Display, Empty, Eyebrow, Muted, Screen, Section } from '@/ui/kit';
import { Locked } from '@/ui/premium';
import { colors, fonts, radius, space } from '@/ui/theme';

const OUTCOME: Record<Outcome, { label: string; color: string }> = {
  win: { label: 'V', color: colors.primary },
  draw: { label: 'N', color: colors.textMuted },
  loss: { label: 'D', color: colors.danger },
};

export default function PlayerScreen() {
  const { playerId, groupId } = useLocalSearchParams<{ playerId: string; groupId: string }>();
  const data = useData();
  const nameOf = usePlayerNames();
  const group = data.groups.find((g) => g.id === groupId);
  const matches = useMemo(() => data.matches.filter((m) => m.groupId === groupId), [data.matches, groupId]);
  const stats = useMemo(() => computeStats(matches, [playerId]).find((s) => s.playerId === playerId), [matches, playerId]);
  const profile = useMemo(() => playerProfile(matches, playerId), [matches, playerId]);

  if (!group || !stats) {
    return (
      <Screen>
        <Empty title="Joueur introuvable." />
      </Screen>
    );
  }
  if (!hasPremium(group)) {
    return (
      <Screen>
        <Locked group={group} admin={isAdmin(group, data.currentPlayerId)} />
      </Screen>
    );
  }

  const maxGoals = Math.max(1, ...profile.months.map((m) => m.goals));
  const pct = (n: number) => `${Math.round(n * 100)} %`;

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Eyebrow>{group.name}</Eyebrow>
        <Display>{nameOf(playerId)}</Display>
        <Muted>
          {stats.played} match{stats.played > 1 ? 's' : ''} · {stats.wins} V · {stats.draws} N · {stats.losses} D
        </Muted>
      </View>

      {stats.played === 0 ? (
        <Empty title="Pas encore de match terminé">
          <Muted>La fiche se remplit dès le premier match joué avec le groupe.</Muted>
        </Empty>
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile label="Victoires" value={pct(stats.winRate)} />
            <Tile label="Buts" value={String(stats.goals)} hint={`${stats.goalsPerMatch.toFixed(1)} / match`} />
            <Tile label="Passes déc." value={String(stats.assists)} hint={`${stats.assistsPerMatch.toFixed(1)} / match`} />
            <Tile label="Points MVP" value={String(stats.mvpPoints)} hint={`${profile.mvpTop} fois homme du match`} />
          </View>

          <Section title="Forme">
            <View style={styles.form}>
              {profile.form.map((o, i) => (
                <View key={i} style={[styles.chip, { backgroundColor: OUTCOME[o].color }]}>
                  <Text style={styles.chipLabel}>{OUTCOME[o].label}</Text>
                </View>
              ))}
            </View>
            <Muted>
              Série en cours : {profile.currentStreak} victoire{profile.currentStreak > 1 ? 's' : ''} · record : {profile.bestStreak}
            </Muted>
          </Section>

          <Section title="Meilleur partenaire">
            {profile.partner ? (
              <Card
                onPress={() => router.push({ pathname: '/player/[playerId]', params: { playerId: profile.partner!.playerId, groupId } })}
                style={styles.partner}>
                <Text style={styles.partnerName}>{nameOf(profile.partner.playerId)}</Text>
                <Muted>
                  {pct(profile.partner.winRate)} de victoires ensemble · {profile.partner.played} matchs
                </Muted>
              </Card>
            ) : (
              <Muted>Il faut au moins 2 matchs avec le même coéquipier.</Muted>
            )}
          </Section>

          <Section title="Buts par mois">
            <View style={styles.chart} accessibilityLabel={profile.months.map((m) => `${m.label} : ${m.goals} buts`).join(', ')}>
              {profile.months.map((m) => (
                <View key={m.key} style={styles.barCol}>
                  <Text style={styles.barValue}>{m.goals || ''}</Text>
                  <View style={[styles.bar, { height: Math.max(4, (m.goals / maxGoals) * 96) }, m.goals === 0 && styles.barEmpty]} />
                  <Text style={styles.barLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </Section>
        </>
      )}
    </Screen>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={styles.tile}>
      <Muted style={{ fontSize: 13 }}>{label}</Muted>
      <Text style={styles.tileValue}>{value}</Text>
      {hint && <Muted style={{ fontSize: 12 }}>{hint}</Muted>}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 2 },
  tileValue: { fontFamily: fonts.displayBlack, fontSize: 32, lineHeight: 36, color: colors.text },
  form: { flexDirection: 'row', gap: space(2) },
  chip: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onFill },
  partner: { gap: 2 },
  partnerName: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), height: 140 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', borderRadius: 6, backgroundColor: colors.primary },
  barEmpty: { backgroundColor: colors.line },
  barValue: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  barLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});
