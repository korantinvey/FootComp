import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useCurrentPlayer } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { SUPPORT_EMAIL } from '@/legal';
import { act } from '@/ui/act';
import { Alert } from '@/ui/dialog';
import { Body, Button, Card, Empty, Field, Muted, Screen, Section } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function Account() {
  const me = useCurrentPlayer();
  const data = useData();
  const [name, setName] = useState(me?.name ?? '');

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
