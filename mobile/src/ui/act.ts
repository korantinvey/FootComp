import { errorMessage } from '@/data/hooks';

import { Alert } from './dialog';

/** Runs a server action; if it fails, tells the player why instead of failing silently. */
export async function act<T>(action: () => Promise<T>, title = 'Action impossible'): Promise<T | undefined> {
  try {
    return await action();
  } catch (e) {
    Alert.alert(title, errorMessage(e));
    return undefined;
  }
}
