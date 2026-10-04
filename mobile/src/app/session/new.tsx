import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { repo } from '@/data/store';
import { act } from '@/ui/act';
import { defaultCapacity } from '@/domain/rules';
import type { Format } from '@/domain/types';
import { Button, Eyebrow, Field, Muted, Screen, Segmented, tap } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const dayNum = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export default function NewSession() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [format, setFormat] = useState<'5' | '11'>('5');
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState('20:00');
  const [place, setPlace] = useState('');
  const [capacity, setCapacity] = useState(10);

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 21 }, (_, i) => new Date(start.getTime() + i * 86400e3));
  }, []);

  const match = /^([01]?\d|2[0-3])[:hH]([0-5]\d)$/.exec(time.trim());

  const create = async () => {
    if (!match || !groupId) return;
    const date = new Date(days[dayIndex]);
    date.setHours(Number(match[1]), Number(match[2]));
    const id = await act(() => repo.createSession(groupId, { format: Number(format) as Format, date: date.toISOString(), place, capacity }));
    if (!id) return;
    router.dismiss();
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: id } });
  };

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Eyebrow>Format</Eyebrow>
        <Segmented
          value={format}
          onChange={(f) => {
            setFormat(f);
            setCapacity(defaultCapacity(Number(f) as Format));
          }}
          options={[
            { value: '5', label: 'Foot à 5' },
            { value: '11', label: 'Foot à 11' },
          ]}
        />
        <Muted>
          {format === '5'
            ? 'Le capitaine compose les deux équipes de 5.'
            : 'Le capitaine compose uniquement son équipe de 11.'}
        </Muted>
      </View>

      <View style={{ gap: space(2) }}>
        <Eyebrow>Jour</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: space(2) }}>
          {days.map((d, i) => {
            const active = i === dayIndex;
            return (
              <Pressable
                key={d.toISOString()}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  tap();
                  setDayIndex(i);
                }}
                style={[styles.day, active && styles.dayActive]}>
                <Text style={[styles.dayName, active && { color: colors.onFill }]}>{i === 0 ? 'auj.' : dayName.format(d)}</Text>
                <Text style={[styles.dayNum, active && { color: colors.onFill }]}>{dayNum.format(d)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Field label="Heure" value={time} onChangeText={setTime} placeholder="20:00" keyboardType="numbers-and-punctuation" />
      {!match && <Muted style={{ color: colors.danger, marginTop: -space(4) }}>Écris l’heure au format 20:30.</Muted>}
      <Field label="Lieu (facultatif)" value={place} onChangeText={setPlace} placeholder="Ex. Le Five Paris 13" />

      <View style={{ gap: space(2) }}>
        <Eyebrow>Places</Eyebrow>
        <View style={styles.stepper}>
          <Button small variant="ghost" label="−" disabled={capacity <= 1} onPress={() => setCapacity(capacity - 1)} style={styles.stepBtn} />
          <Text style={styles.capacity}>{capacity}</Text>
          <Button small variant="ghost" label="+" onPress={() => setCapacity(capacity + 1)} style={styles.stepBtn} />
        </View>
        <Muted>
          Les {capacity} premiers à répondre présent sont inscrits. Les suivants passent en liste d’attente et montent dès
          qu’une place se libère.
        </Muted>
      </View>

      <Button label="Envoyer l’invitation au groupe" disabled={!match} onPress={create} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  stepBtn: { width: 52, minHeight: 44 },
  capacity: { fontFamily: fonts.displayBlack, fontSize: 44, color: colors.text, minWidth: 56, textAlign: 'center' },
  day: {
    width: 68,
    paddingVertical: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
  },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayName: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.textMuted, letterSpacing: 1 },
  dayNum: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
});
