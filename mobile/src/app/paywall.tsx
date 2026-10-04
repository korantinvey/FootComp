import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage, useCurrentPlayer } from '@/data/hooks';
import { monthlyOffer, restoreGroup, subscribeGroup } from '@/data/purchases';
import { getData, refresh, useData } from '@/data/store';
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
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof monthlyOffer>>>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  useEffect(() => {
    monthlyOffer().then(setOffer).catch(() => setOffer(null));
  }, []);

  if (!group || !me) {
    return (
      <Screen>
        <Empty title="Ce groupe n'existe plus." />
      </Screen>
    );
  }

  const access = accessOf(group);
  const admin = isAdmin(group, me.id);
  const price = offer?.price ?? PRICE_LABEL.replace(' / mois', '');

  /** The store confirms to our server through a webhook: wait for it before saying "done". */
  const waitForServer = async () => {
    for (let i = 0; i < 12; i++) {
      await refresh();
      const g = getData().groups.find((x) => x.id === group.id);
      if (g && accessOf(g) === 'subscribed') return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  };

  const subscribe = async () => {
    if (!offer) {
      Alert.alert('Paiement indisponible', 'L’abonnement n’est pas encore proposé sur cet appareil. Réessaie plus tard.');
      return;
    }
    setBusy('buy');
    try {
      if (!(await subscribeGroup(group.id, offer.pkg))) return;
      const ok = await waitForServer();
      Alert.alert(
        ok ? 'Groupe abonné' : 'Paiement reçu',
        ok ? `${group.name} a accès à tout. Merci !` : 'L’activation peut prendre une minute. Rouvre le groupe dans un instant.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Paiement impossible', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      await restoreGroup(group.id);
      const ok = await waitForServer();
      Alert.alert('Restaurer mes achats', ok ? 'Abonnement retrouvé pour ce groupe.' : 'Aucun abonnement actif trouvé sur ton compte Apple ou Google.');
    } catch (e) {
      Alert.alert('Restauration impossible', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Eyebrow>Abonnement du groupe</Eyebrow>
        <Display>{group.name}</Display>
        <Muted>Un seul abonnement, payé par un admin, débloque tout pour tous les joueurs du groupe.</Muted>
      </View>

      <View style={styles.price}>
        <Body style={styles.priceValue}>{price} / mois</Body>
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
          <Button label="Abonner le groupe" busy={busy === 'buy'} disabled={!!busy} onPress={subscribe} />
          <Button variant="ghost" label="Restaurer mes achats" busy={busy === 'restore'} disabled={!!busy} onPress={restore} />
        </View>
      ) : (
        <Muted style={{ color: colors.text }}>Seul un admin du groupe peut l’abonner.</Muted>
      )}

      <Muted style={styles.legal}>
        Abonnement mensuel de {price} pour tout le groupe, renouvelé automatiquement chaque mois. Le paiement
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
