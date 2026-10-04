/**
 * Store subscriptions through RevenueCat. A subscription belongs to a group:
 * the purchase is made under the RevenueCat user "group_<id>", and the
 * RevenueCat webhook (supabase/functions/revenuecat-webhook) then writes
 * groups.subscribed_until on the server. The app never unlocks anything itself.
 */
import { Platform } from 'react-native';

import type { ID } from '@/domain/types';

type PurchasesModule = typeof import('react-native-purchases').default;
type Package = import('react-native-purchases').PurchasesPackage;

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

let configured = false;
function sdk(): PurchasesModule | null {
  if (Platform.OS === 'web' || !API_KEY) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Purchases = (require('react-native-purchases') as typeof import('react-native-purchases')).default;
  if (!configured) {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
  }
  return Purchases;
}

export const storeAvailable = () => sdk() !== null;

const groupUser = (groupId: ID) => `group_${groupId}`;

/** The monthly group subscription with its price as the store displays it. */
export async function monthlyOffer(): Promise<{ pkg: Package; price: string } | null> {
  const Purchases = sdk();
  if (!Purchases) return null;
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0];
  return pkg ? { pkg, price: pkg.product.priceString } : null;
}

/** Returns false when the player closed the store sheet. */
export async function subscribeGroup(groupId: ID, pkg: Package) {
  const Purchases = sdk();
  if (!Purchases) throw new Error('Paiement indisponible sur cet appareil.');
  await Purchases.logIn(groupUser(groupId));
  try {
    await Purchases.purchasePackage(pkg);
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw new Error('Le paiement n’a pas abouti. Aucun montant n’a été débité.');
  }
}

export async function restoreGroup(groupId: ID) {
  const Purchases = sdk();
  if (!Purchases) throw new Error('Restauration indisponible sur cet appareil.');
  await Purchases.logIn(groupUser(groupId));
  await Purchases.restorePurchases();
}
