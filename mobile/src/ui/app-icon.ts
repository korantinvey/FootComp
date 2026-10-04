import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { JERSEYS } from './jerseys.generated';

const CHOSEN_KEY = 'footcomp:camp-chosen';

/** Native module, absent on web. */
function nativeIcons(): typeof import('expo-alternate-app-icons') | null {
  if (Platform.OS === 'web') return null;
  try {
    // Lazy: the native module does not exist on web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-alternate-app-icons') as typeof import('expo-alternate-app-icons');
    return mod.supportsAlternateIcons ? mod : null;
  } catch {
    return null;
  }
}

export const canChangeIcon = () => nativeIcons() !== null;

/** Id of the jersey shown on the home screen right now. */
export function currentJersey(): string {
  return (nativeIcons()?.getAppIconName() as string | null) ?? JERSEYS[0].id;
}

export async function chooseJersey(id: string) {
  await AsyncStorage.setItem(CHOSEN_KEY, id).catch(() => {});
  const icons = nativeIcons();
  if (!icons || id === currentJersey()) return;
  await icons.setAlternateAppIcon(id === JERSEYS[0].id ? null : (id as never));
}

/** The app icon lives on this phone, so "Choisis ton camp" is asked once per install. */
export async function hasChosenCamp() {
  try {
    return (await AsyncStorage.getItem(CHOSEN_KEY)) !== null;
  } catch {
    return true;
  }
}
