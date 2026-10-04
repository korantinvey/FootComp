import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { act } from '@/ui/act';
import { Alert } from '@/ui/dialog';
import { canChangeIcon, chooseJersey, currentJersey } from '@/ui/app-icon';
import { JERSEYS } from '@/ui/jerseys.generated';
import { Button, Display, Eyebrow, Muted, Screen, tap } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

/** "Choisis ton camp": the player picks the jersey that becomes the app icon. */
export default function Camp() {
  const { first } = useLocalSearchParams<{ first?: string }>();
  const [picked, setPicked] = useState(currentJersey());
  const [busy, setBusy] = useState(false);

  const done = () => (first ? router.replace('/') : router.back());

  const apply = async () => {
    setBusy(true);
    await act(() => chooseJersey(picked), 'Icône non modifiée');
    setBusy(false);
    done();
  };

  // Android closes the app while it swaps the home screen icon: say so first.
  const confirm = () => {
    if (Platform.OS === 'android' && canChangeIcon() && picked !== currentJersey()) {
      Alert.alert('Changer l’icône', 'FootComp va se fermer quelques secondes le temps que ton téléphone change l’icône. Rouvre-la depuis ton nouveau maillot.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Changer', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  return (
    <Screen edges={first ? ['top', 'bottom'] : ['bottom']}>
      <Stack.Screen options={{ headerShown: !first, gestureEnabled: !first }} />
      <View style={{ gap: space(2), paddingTop: first ? space(6) : 0 }}>
        <Eyebrow>Icône de l’app</Eyebrow>
        <Display>Choisis ton camp</Display>
        <Muted>
          Le maillot que tu choisis devient l’icône de FootComp sur ton téléphone. Tu pourras en changer quand tu veux dans
          « Mon compte ».
        </Muted>
        {!canChangeIcon() && <Muted style={{ color: colors.danger }}>Ce téléphone ne permet pas de changer l’icône des apps.</Muted>}
      </View>

      <View style={styles.grid}>
        {JERSEYS.map((j) => {
          const on = j.id === picked;
          return (
            <Pressable
              key={j.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={j.name}
              onPress={() => {
                tap();
                setPicked(j.id);
              }}
              style={[styles.cell, on && styles.cellOn]}>
              <Image source={j.preview} style={styles.preview} />
              <Text style={[styles.name, on && { color: colors.text }]} numberOfLines={2}>
                {j.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: space(3) }}>
        <Button label="C’est mon camp" busy={busy} onPress={confirm} />
        {first && <Button variant="ghost" label="Plus tard" onPress={() => act(async () => { await chooseJersey(JERSEYS[0].id); done(); })} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  cell: {
    width: '31.5%',
    alignItems: 'center',
    gap: space(1.5),
    paddingVertical: space(3),
    paddingHorizontal: space(1),
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  cellOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  preview: { width: 72, height: 72 },
  name: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 15, color: colors.textMuted, textAlign: 'center' },
});
