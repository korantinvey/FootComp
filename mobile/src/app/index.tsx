import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCurrentPlayer } from '@/data/hooks';
import { repo, useAuthStatus, useData } from '@/data/store';
import { isAdmin } from '@/domain/rules';
import { Body, Button, Card, Display, Empty, Eyebrow, Field, HalfwayRule, Muted, Screen, Section, Tag, tap } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';

export default function Home() {
  const data = useData();
  const me = useCurrentPlayer();
  const auth = useAuthStatus();
  const [code, setCode] = useState('');
  if (auth !== 'ready') return <Redirect href="/welcome" />;
  if (!me) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Empty title="Profil introuvable">
          <Muted>Ton compte est connecté mais ton profil joueur n’a pas été créé. Déconnecte-toi puis reconnecte-toi.</Muted>
          <Button variant="ghost" label="Se déconnecter" onPress={() => repo.signOut()} />
        </Empty>
      </Screen>
    );
  }

  const myGroups = data.groups.filter((g) => g.members.some((m) => m.playerId === me.id));

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Eyebrow>Salut</Eyebrow>
          <Display numberOfLines={1}>{me.name}</Display>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mon compte"
          onPress={() => {
            tap();
            router.push('/account');
          }}
          style={styles.avatar}>
          <Body style={styles.avatarLetter}>{me.name.slice(0, 1).toUpperCase()}</Body>
        </Pressable>
      </View>

      <HalfwayRule />

      <Section
        title="Mes groupes"
        action={myGroups.length > 0 && <Button small variant="ghost" label="Créer" onPress={() => router.push('/group/new')} />}>
        {myGroups.length === 0 ? (
          <Empty title="Aucun groupe pour l'instant">
            <Muted>Crée le groupe de ton five ou de ton club : tu en seras l&apos;admin et tu pourras ajouter les joueurs.</Muted>
            <Button label="Créer un groupe" onPress={() => router.push('/group/new')} />
          </Empty>
        ) : (
          myGroups.map((g) => {
            const upcoming = data.sessions
              .filter((s) => s.groupId === g.id && new Date(s.date).getTime() > Date.now() - 6 * 3600e3)
              .sort((a, b) => a.date.localeCompare(b.date))[0];
            const played = data.matches.filter((m) => m.groupId === g.id && m.status === 'finished').length;
            return (
              <Card
                key={g.id}
                onPress={() => router.push({ pathname: '/group/[groupId]', params: { groupId: g.id } })}>
                <View style={styles.groupTop}>
                  <Display style={styles.groupName} numberOfLines={1}>
                    {g.name}
                  </Display>
                  {isAdmin(g, me.id) && <Tag label="Admin" color={colors.highlight} />}
                </View>
                <Muted>
                  {g.members.length} joueur{g.members.length > 1 ? 's' : ''} · {played} match{played > 1 ? 's' : ''} joué
                  {played > 1 ? 's' : ''}
                  {upcoming ? ' · prochaine session programmée' : ''}
                </Muted>
              </Card>
            );
          })
        )}
      </Section>

      <Section title="Rejoindre un groupe">
        <View style={styles.joinRow}>
          <View style={{ flex: 1 }}>
            <Field
              label="Code d’invitation"
              placeholder="Ex. K7PX2M"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
          </View>
          <Button
            label="OK"
            disabled={code.trim().length !== 6}
            onPress={() => router.push({ pathname: '/join/[code]', params: { code: code.trim() } })}
            style={{ alignSelf: 'flex-end' }}
          />
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space(4), paddingTop: space(4) },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontFamily: fonts.displayBlack, fontSize: 24, color: colors.onFill, lineHeight: 28 },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  groupName: { fontSize: 30, lineHeight: 32, flex: 1 },
  joinRow: { flexDirection: 'row', gap: space(3) },
});
