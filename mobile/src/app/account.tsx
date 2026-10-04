import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, View } from 'react-native';

import { useCurrentPlayer } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { SUPPORT_EMAIL } from '@/legal';
import { act } from '@/ui/act';
import { currentJersey } from '@/ui/app-icon';
import { PlayerAvatar } from '@/ui/avatar';
import { Alert } from '@/ui/dialog';
import { JERSEYS } from '@/ui/jerseys.generated';
import { Body, Button, Card, Empty, Field, Muted, Screen, Section } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function Account() {
  const me = useCurrentPlayer();
  const data = useData();
  const [name, setName] = useState(me?.name ?? '');
  const jersey = JERSEYS.find((j) => j.id === currentJersey()) ?? JERSEYS[0];

  if (!me) {
    return (
      <Screen>
        <Empty title="Aucun compte connecté." />
      </Screen>
    );
  }

  const myGroups = data.groups.filter((g) => g.members.some((m) => m.playerId === me.id));
  const soleAdminOf = myGroups.filter(
    (g) => g.members.length > 1 && g.members.filter((m) => m.role === 'admin').every((m) => m.playerId === me.id),
  );

  const confirmDelete = () => {
    const handover = soleAdminOf.length
      ? `\n\nTu es le seul admin de : ${soleAdminOf.map((g) => g.name).join(', ')}. Le membre le plus ancien deviendra admin.`
      : '';
    Alert.alert(
      'Supprimer ton compte ?',
      `Ton profil et ton nom seront effacés définitivement, et tu quitteras tous tes groupes. Tes buts et votes passés restent dans l’historique des matchs, sans ton nom.${handover}\n\nSi un de tes groupes est abonné, pense à résilier l’abonnement depuis les réglages de ton compte Apple ou Google.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: () => {
            act(async () => {
              await repo.deleteAccount();
              router.dismissAll();
              router.replace('/welcome');
            });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Section title="Profil">
        <Field label="Nom de joueur" value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={() => name.trim() && act(() => repo.renamePlayer(me.id, name))} />
        <Button variant="ghost" label="Enregistrer" disabled={!name.trim() || name.trim() === me.name} onPress={() => act(() => repo.renamePlayer(me.id, name))} />
      </Section>

      <Section title="Mon avatar">
        <Card onPress={() => router.push('/avatar')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PlayerAvatar playerId={me.id} size={56} />
          <View style={{ flex: 1 }}>
            <Body>{me.avatarKit ? 'Changer de maillot' : 'Choisis ton maillot'}</Body>
            <Muted>Ton maillot floqué à ton nom, visible par ton groupe</Muted>
          </View>
        </Card>
      </Section>

      <Section title="Icône de l’app">
        <Card onPress={() => router.push('/camp')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={jersey.preview} style={{ width: 44, height: 44 }} />
          <View style={{ flex: 1 }}>
            <Body>Choisis ton camp</Body>
            <Muted>{jersey.name}</Muted>
          </View>
        </Card>
      </Section>

      <Section title="Connexion">
        <Muted>{me.email ?? me.phone ?? ''}</Muted>
        <Button
          variant="ghost"
          label="Se déconnecter"
          onPress={() =>
            act(async () => {
              await repo.signOut();
              router.dismissAll();
              router.replace('/welcome');
            })
          }
        />
      </Section>

      <Section title="Informations">
        <Card onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
          <Body>Conditions d’utilisation</Body>
        </Card>
        <Card onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
          <Body>Politique de confidentialité</Body>
        </Card>
        <Card onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=FootComp`).catch(() => {})}>
          <Body>Contacter le support</Body>
          <Muted>{SUPPORT_EMAIL}</Muted>
        </Card>
      </Section>

      <Section title="Zone sensible">
        <Button variant="ghost" label="Supprimer mon compte" onPress={confirmDelete} style={{ borderColor: colors.danger }} />
      </Section>

      <View style={{ alignItems: 'center' }}>
        <Muted style={{ fontFamily: fonts.bodyMedium, fontSize: 12 }}>FootComp {Constants.expoConfig?.version}</Muted>
      </View>
    </Screen>
  );
}
