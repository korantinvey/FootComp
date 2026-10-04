import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { legalDoc, type LegalDoc } from '@/legal';
import { Body, Display, Eyebrow, Muted, Screen } from '@/ui/kit';
import { fonts, space } from '@/ui/theme';

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: LegalDoc }>();
  const d = legalDoc(doc === 'privacy' ? 'privacy' : 'terms');
  const updated = new Date(d.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ gap: space(2) }}>
        <Eyebrow>Mis à jour le {updated}</Eyebrow>
        <Display style={{ fontSize: 34, lineHeight: 36 }}>{d.title}</Display>
      </View>
      {d.sections.map((s) => (
        <View key={s.heading} style={{ gap: space(2) }}>
          <Body style={{ fontFamily: fonts.bodyBold }}>{s.heading}</Body>
          <Muted style={{ fontSize: 15, lineHeight: 22 }}>{s.body}</Muted>
        </View>
      ))}
    </Screen>
  );
}
