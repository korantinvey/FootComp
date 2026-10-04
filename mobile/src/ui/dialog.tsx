/**
 * Themed replacement for React Native's Alert, whose dialogs always use the
 * system look on Android. Same call shape: Alert.alert(title, message?, buttons?).
 * <DialogHost /> must be mounted once at the root.
 */
import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { tap } from './kit';
import { colors, fonts, radius, space } from './theme';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type Dialog = { id: number; title: string; message?: string; buttons: AlertButton[] };

let queue: Dialog[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    queue = [...queue, { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] }];
    emit();
  },
};

function close(dialog: Dialog, button?: AlertButton) {
  queue = queue.filter((d) => d.id !== dialog.id);
  emit();
  button?.onPress?.();
}

export function DialogHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue[0],
  );
  if (!current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const actions = current.buttons.filter((b) => b.style !== 'cancel');
  // Two choices sit side by side; longer lists stack like an action sheet.
  const stacked = current.buttons.length > 2;
  const ordered = stacked ? [...actions, ...(cancel ? [cancel] : [])] : [...(cancel ? [cancel] : []), ...actions];

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={() => close(current, cancel)}>
      <Pressable style={styles.backdrop} onPress={() => cancel && close(current, cancel)} accessibilityRole="none">
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityRole="alert">
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}
          <View style={[styles.buttons, stacked ? styles.stacked : styles.row]}>
            {ordered.map((b, i) => {
              const primary = !stacked && b.style !== 'cancel' && b.style !== 'destructive' && i === ordered.length - 1;
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    close(current, b);
                  }}
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && { flex: 1 },
                    primary && styles.primary,
                    b.style === 'destructive' && styles.destructive,
                    b.style === 'cancel' && styles.cancel,
                    pressed && { opacity: 0.75 },
                  ]}>
                  <Text
                    style={[
                      styles.label,
                      primary && { color: colors.onFill },
                      b.style === 'destructive' && { color: colors.danger },
                      b.style === 'cancel' && { color: colors.textMuted },
                    ]}
                    numberOfLines={2}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: space(5) },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: space(5),
    gap: space(3),
  },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.text, },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  buttons: { marginTop: space(2), gap: space(2) },
  row: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(3),
  },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  destructive: { borderColor: colors.danger },
  cancel: { borderColor: 'transparent' },
  label: { fontFamily: fonts.display, fontSize: 17, color: colors.text, letterSpacing: 0.6, textAlign: 'center' },
});
