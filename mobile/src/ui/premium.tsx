import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { hasPremium, trialDaysLeft, accessOf } from '@/domain/plan';
import type { Group } from '@/domain/types';

import { Body, Button, Card, Display, Eyebrow, Muted, Screen } from './kit';
import { colors, fonts, space } from './theme';

/** Placeholder until the price is set in App Store Connect / Play Console. */
export const PRICE_LABEL = '4,99 € / mois';

export const PREMIUM_FEATURES = ['Compos des équipes', 'Match en direct et passes décisives', 'Votes MVP', 'Tableau de stats'];

export function openPaywall(groupId: string) {
  router.push({ pathname: '/paywall', params: { groupId } });
}

/** Renders children when the group has access, an upgrade screen otherwise. */
export function PremiumGate({ group, admin, children }: { group: Group; admin: boolean; children: ReactNode }) {
  if (hasPremium(group)) return children;
  return (
    <Screen>
      <Locked group={group} admin={admin} />
    </Screen>
  );
}

export function Locked({ group, admin }: { group: Group; admin: boolean }) {
  return (
    <View style={{ gap: space(4) }}>
      <Eyebrow>Mois gratuit terminé</Eyebrow>
      <Display style={{ fontSize: 34, lineHeight: 36 }}>Réservé aux groupes abonnés</Display>
      <Muted>
        Les invitations et les inscriptions restent gratuites. Les compos, le match en direct, les votes MVP et les stats
        demandent l’abonnement du groupe.
      </Muted>
      {admin ? (
        <Button label="Voir l’abonnement" onPress={() => openPaywall(group.id)} />
      ) : (
        <Muted style={{ color: colors.text }}>Un admin du groupe peut abonner le groupe pour tout le monde.</Muted>
      )}
    </View>
  );
}

/** Small status line shown at the top of a group. */
export function PlanBanner({ group, admin }: { group: Group; admin: boolean }) {
  const access = accessOf(group);
  if (access === 'subscribed') return null;
  const days = trialDaysLeft(group);
  return (
    <Card style={[styles.banner, access === 'free' && { borderColor: colors.highlight }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={styles.bannerTitle}>
          {access === 'trial' ? `Mois gratuit · ${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}` : 'Version gratuite'}
        </Body>
        <Muted style={{ fontSize: 13 }}>
          {access === 'trial' ? 'Tout est débloqué pour le groupe.' : 'Invitations seulement. Compos, live, votes et stats bloqués.'}
        </Muted>
      </View>
      {admin && <Button small variant={access === 'free' ? 'primary' : 'ghost'} label="S’abonner" onPress={() => openPaywall(group.id)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  bannerTitle: { fontFamily: fonts.bodySemi, fontSize: 15 },
});
