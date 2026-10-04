import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCurrentPlayer } from '@/data/hooks';
import { repo } from '@/data/store';
import { act } from '@/ui/act';
import { JerseyAvatar } from '@/ui/avatar';
import { JERSEYS } from '@/ui/jerseys.generated';
import { Button, Empty, Field, Muted, Screen, Section, tap } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

/** The player picks the jersey that becomes their avatar, printed with their name. */
export default function AvatarScreen() {
  const me = useCurrentPlayer();
  const [kit, setKit] = useState<string | null>(me?.avatarKit ?? null);
  const [number, setNumber] = useState(me?.avatarNumber != null ? String(me.avatarNumber) : '');
  const [busy, setBusy] = useState(false);

  if (!me) {
    return (
      <Screen>
        <Empty title="Aucun compte connecté." />
      </Screen>
    );
  }

  const num = number.trim() === '' ? null : Math.min(99, Number(number));

  const save = async (nextKit: string | null) => {
    setBusy(true);
    await act(() => repo.setAvatar(me.id, nextKit, nextKit ? num : null));
    setBusy(false);
    router.back();
  };

  return (
    <Screen>
      <View style={styles.preview}>
        <JerseyAvatar name={me.name} kit={kit} number={kit ? num : null} size={168} />
        <Muted>{kit ? 'Ton maillot, floqué à ton nom' : 'Sans maillot, on affiche ton initiale'}</Muted>
      </View>

      <Field
        label="Numéro (facultatif)"
        placeholder="Ex. 10"
        value={number}
        onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 2))}
        keyboardType="number-pad"
        maxLength={2}
      />

      <Section title="Choisis ton maillot">
        <View style={styles.grid}>
          {JERSEYS.map((j) => {
            const on = j.id === kit;
            return (
              <Pressable
                key={j.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={j.name}
                onPress={() => {
                  tap();
                  setKit(j.id);
                }}
                style={[styles.cell, on && styles.cellOn]}>
                <Image source={j.blank} style={styles.thumb} />
                <Text style={[styles.cellName, on && { color: colors.text }]} numberOfLines={2}>
                  {j.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <View style={{ gap: space(3) }}>
        <Button label="Enregistrer mon avatar" busy={busy} disabled={!kit} onPress={() => save(kit)} />
        {me.avatarKit && <Button variant="ghost" label="Retirer mon maillot" disabled={busy} onPress={() => save(null)} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: space(2) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  cell: {
    width: '31.5%',
    alignItems: 'center',
    gap: space(1),
    paddingVertical: space(2),
    paddingHorizontal: space(1),
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  cellOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  thumb: { width: 64, height: 64 },
  cellName: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 15, color: colors.textMuted, textAlign: 'center' },
});
