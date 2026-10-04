import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, space } from './theme';

export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

export function Screen({
  children,
  scroll = true,
  edges = ['bottom'],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.scroll, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type TProps = TextProps & { style?: StyleProp<TextStyle> };

export function Display({ style, ...p }: TProps) {
  return <Text {...p} style={[s.display, style]} />;
}

export function Eyebrow({ style, ...p }: TProps) {
  return <Text {...p} style={[s.eyebrow, style]} />;
}

export function Body({ style, ...p }: TProps) {
  return <Text {...p} style={[s.body, style]} />;
}

export function Muted({ style, ...p }: TProps) {
  return <Text {...p} style={[s.body, s.muted, style]} />;
}

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: 'primary' | 'dark' | 'ghost' | 'danger' | 'teamA' | 'teamB';
  small?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', small, busy, disabled, style, onPress, ...p }: ButtonProps) {
  const filled = variant !== 'ghost';
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'dark'
        ? colors.text
        : variant === 'danger'
          ? colors.danger
          : variant === 'teamA'
            ? colors.teamA
            : variant === 'teamB'
              ? colors.teamB
              : colors.surface;
  return (
    <Pressable
      {...p}
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg, borderColor: filled ? bg : colors.lineStrong },
        (disabled || busy) && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={filled ? colors.onFill : colors.text} />
      ) : (
        <Text style={[s.buttonLabel, small && s.buttonLabelSmall, { color: filled ? colors.onFill : colors.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, style, ...p }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...p}
        style={[s.input, style]}
      />
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: colors.surfacePressed }, style]}>
      {children}
    </Pressable>
  );
}

/** A chalk line across the screen, with the halfway circle cut into it. */
export function HalfwayRule({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.ruleWrap, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.ruleLine} />
      <View style={s.ruleCircle} />
      <View style={s.ruleLine} />
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space(3) }}>
      <View style={s.sectionHead}>
        <Eyebrow>{title}</Eyebrow>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[s.segment, active && s.segmentActive]}>
            <Text style={[s.segmentLabel, active && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Tag({ label, color = colors.textMuted }: { label: string; color?: string }) {
  return (
    <View style={[s.tag, { borderColor: `${color}33`, backgroundColor: `${color}14` }]}>
      <Text style={[s.tagLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={s.empty}>
      <Body style={{ fontFamily: fonts.bodySemi }}>{title}</Body>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space(5), gap: space(6), paddingBottom: space(12) },
  display: { fontFamily: fonts.display, color: colors.text, fontSize: 34, lineHeight: 38, letterSpacing: -0.5 },
  eyebrow: { fontFamily: fonts.bodySemi, color: colors.textMuted, fontSize: 13, letterSpacing: 0.2 },
  body: { fontFamily: fonts.body, color: colors.text, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 52,
    paddingHorizontal: space(6),
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: space(4) },
  buttonLabel: { fontFamily: fonts.bodySemi, fontSize: 17 },
  buttonLabelSmall: { fontSize: 14 },
  input: {
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space(4),
    gap: space(2),
  },
  ruleWrap: { flexDirection: 'row', alignItems: 'center' },
  ruleLine: { flex: 1, height: 1, backgroundColor: colors.line },
  ruleCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfacePressed, borderRadius: radius.pill, padding: 4 },
  segment: { flex: 1, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  segmentLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textMuted },
  tag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1 },
  tagLabel: { fontFamily: fonts.bodySemi, fontSize: 12 },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    padding: space(5),
    gap: space(3),
    backgroundColor: colors.surface,
  },
});
