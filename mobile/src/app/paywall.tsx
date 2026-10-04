import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCurrentPlayer } from '@/data/hooks';
import { useData } from '@/data/store';
import { accessOf, trialDaysLeft } from '@/domain/plan';
import { isAdmin } from '@/domain/rules';
import { Alert } from '@/ui/dialog';
import { Body, Button, Display, Empty, Eyebrow, HalfwayRule, Muted, Screen } from '@/ui/kit';
import { PREMIUM_FEATURES, PRICE_LABEL } from '@/ui/premium';
import { colors, fonts, space } from '@/ui/theme';

export default function Paywall() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const group = data.groups.find((g) => g.id === groupId);

  if (!group || !me) {
    return (
      <Screen>
        <Empty title="Ce groupe n'existe plus." />
      </Screen>
    );
  }

  const access = accessOf(group);
  const admin = isAdmin(group, me.id);

  const subscribe = () => {
    // TODO: store purchase through RevenueCat (needs a development build); the
    // store webhook then sets groups.subscribed_until on the server.
    Alert.alert('Bientôt disponible', 'Le paiement par l’App Store et Google Play arrive avec la version publiée de l’app.');
  };

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Eyebrow>Abonnement du groupe</Eyebrow>
        <Display>{group.name}</Display>
        <Muted>Un seul abonnement, payé par un admin, débloque tout pour tous les joueurs du groupe.</Muted>
      </View>

      <View style={styles.price}>
        <Body style={styles.priceValue}>{PRICE_LABEL}</Body>
        <Muted>Sans engagement, résiliable à tout moment depuis ton compte App Store ou Google Play.</Muted>
      </View>

      <View style={{ gap: space(3) }}>
        {PREMIUM_FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <View style={styles.tick} />
            <Body>{f}</Body>
          </View>
        ))}
        <View style={styles.feature}>
          <View style={[styles.tick, { backgroundColor: colors.textMuted }]} />
          <Muted style={{ fontSize: 16 }}>Invitations et inscriptions : toujours gratuites</Muted>
        </View>
      </View>

      <HalfwayRule />

      {access === 'subscribed' ? (
        <Muted style={{ color: colors.text }}>Le groupe est déjà abonné.</Muted>
      ) : admin ? (
        <View style={{ gap: space(3) }}>
          {access === 'trial' && (
            <Muted>
              Mois gratuit en cours : encore {trialDaysLeft(group)} jour{trialDaysLeft(group) > 1 ? 's' : ''}. Tu peux t’abonner
              maintenant ou attendre la fin.
            </Muted>
          )}
          <Button label="Abonner le groupe" onPress={subscribe} />
          <Button variant="ghost" label="Restaurer mes achats" onPress={() => Alert.alert('Restaurer mes achats', 'Disponible avec la version publiée sur les stores.')} />
        </View>
      ) : (
        <Muted style={{ color: colors.text }}>Seul un admin du groupe peut l’abonner.</Muted>
      )}

      <Muted style={styles.legal}>
        Abonnement mensuel de {PRICE_LABEL.replace(' / mois', '')} pour tout le groupe, renouvelé automatiquement chaque mois. Le paiement
        est débité sur ton compte App Store ou Google Play à la confirmation de l’achat. L’abonnement se renouvelle sauf
        résiliation au moins 24 h avant la fin de la période en cours, depuis les réglages de ton compte Apple ou Google.
      </Muted>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
          <Text style={styles.link}>Conditions d’utilisation</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
          <Text style={styles.link}>Confidentialité</Text>
        </Pressable>
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { gap: space(2) },
  priceValue: { fontFamily: fonts.displayBlack, fontSize: 48, lineHeight: 52, color: colors.highlight, },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  tick: { width: 14, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  legal: { fontSize: 12, lineHeight: 17 },
  links: { flexDirection: 'row', gap: space(5) },
  link: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, textDecorationLine: 'underline' },
});
