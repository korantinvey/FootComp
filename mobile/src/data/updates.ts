import * as Updates from 'expo-updates';

/**
 * Applies a remote update as soon as the app opens, instead of waiting for
 * the next launch. Runs behind the splash screen; gives up after a few
 * seconds so a slow network never blocks the app.
 */
export async function applyPendingUpdate(timeoutMs = 4000) {
  if (__DEV__ || !Updates.isEnabled) return;
  const attempt = (async () => {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  })();
  await Promise.race([attempt.catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))]);
}
