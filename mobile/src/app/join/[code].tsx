import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/data/hooks';
import { repo, useAuthStatus } from '@/data/store';
import { Button, Display, Eyebrow, Muted, Screen } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

/** Target of invitation links: footcomp://join/<code>. */
export default function Join() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const auth = useAuthStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth !== 'ready') return <Redirect href="/welcome" />;

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const groupId = await repo.joinGroup(code);
      router.replace({ pathname: '/group/[groupId]', params: { groupId } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: space(2), paddingTop: space(6) }}>
        <Eyebrow>Invitation</Eyebrow>
        <Display>Code {code.toUpperCase()}</Display>
        <Muted>Tu vas rejoindre le groupe qui t’a envoyé ce code.</Muted>
      </View>
      {error && <Muted style={{ color: colors.danger }}>{error}</Muted>}
      <Button label="Rejoindre le groupe" busy={busy} onPress={join} />
      <Button variant="ghost" label="Retour à l’accueil" onPress={() => router.replace('/')} />
    </Screen>
  );
}
