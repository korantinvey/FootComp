import { Image, StyleSheet, Text, View } from 'react-native';

import { useData } from '@/data/store';
import type { ID } from '@/domain/types';

import { JERSEYS } from './jerseys.generated';
import { colors, fonts } from './theme';

const INITIAL_COLORS = [colors.primary, colors.teamA, colors.teamB, '#0EA5E9', '#DB2777', '#7C3AED', '#D97706', '#0F766E'];

/** Always the same colour for the same name. */
function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length];
}

type Look = { name: string; kit: string | null; number: number | null };

/** The jersey chosen by the player with their name printed on it, or their initial. */
export function JerseyAvatar({ name, kit, number, size }: Look & { size: number }) {
  const jersey = kit ? JERSEYS.find((j) => j.id === kit) : undefined;
  if (!jersey) {
    return (
      <View style={[styles.initial, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) }]}>
        <Text style={[styles.initialLetter, { fontSize: size * 0.46 }]}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`Maillot de ${name}`}>
      <Image source={jersey.blank} style={{ width: size, height: size }} />
      <View style={[styles.print, { top: size * 0.36, left: size * 0.29, right: size * 0.29 }]}>
        <Text
          style={[styles.name, { color: jersey.ink, fontSize: Math.max(7, size * 0.1) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}>
          {name.toUpperCase()}
        </Text>
        {number !== null && (
          <Text style={[styles.number, { color: jersey.ink, fontSize: size * 0.22, lineHeight: size * 0.25 }]}>{number}</Text>
        )}
      </View>
    </View>
  );
}

/** Avatar of a player of the app, read from the loaded data. */
export function PlayerAvatar({ playerId, size }: { playerId: ID | null | undefined; size: number }) {
  const { players } = useData();
  const p = players.find((x) => x.id === playerId);
  return <JerseyAvatar name={p?.name ?? '?'} kit={p?.avatarKit ?? null} number={p?.avatarNumber ?? null} size={size} />;
}

const styles = StyleSheet.create({
  initial: { alignItems: 'center', justifyContent: 'center' },
  initialLetter: { fontFamily: fonts.displayBlack, color: colors.onFill },
  print: { position: 'absolute', alignItems: 'center' },
  name: { fontFamily: fonts.bodyBold, letterSpacing: 0.5, textAlign: 'center' },
  number: { fontFamily: fonts.displayBlack, textAlign: 'center' },
});
