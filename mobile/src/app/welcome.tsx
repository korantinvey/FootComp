import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/data/hooks';
import { repo, useAuthStatus } from '@/data/store';
import { parseContact } from '@/domain/contact';
import { Body, Button, Display, Eyebrow, Field, HalfwayRule, Muted, Screen } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';

const RESEND_DELAY = 60;

export default function Welcome() {
  const auth = useAuthStatus();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (auth === 'ready') return <Redirect href="/" />;

  const validEmail = parseContact(email)?.kind === 'email';

  const send = async () => {
    if (!validEmail) return setError('Écris une adresse email valide.');
    setBusy(true);
    setError(null);
    try {
      await repo.sendCode(email, name);
      setStep('code');
      setCooldown(RESEND_DELAY);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < 6) return setError('Saisis le code complet reçu par email.');
    setBusy(true);
    setError(null);
    try {
      await repo.verifyCode(email, code);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const goTerms = () => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } });
  const goPrivacy = () => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <View style={styles.hero}>
          <Eyebrow>Foot entre potes · Clubs</Eyebrow>
          <Display style={styles.title}>Foot{'\n'}Comp</Display>
          <View style={styles.bibs}>
            <View style={[styles.bib, { backgroundColor: colors.teamA }]} />
            <View style={[styles.bib, { backgroundColor: colors.teamB }]} />
          </View>
          <Body style={styles.lead}>Les inscriptions, les compos, le score en direct, les votes MVP et les stats de toute la bande.</Body>
        </View>

        <HalfwayRule />

        {step === 'email' ? (
          <View style={{ gap: space(4) }}>
            <Field
              label="Ton prénom ou surnom"
              placeholder="Ex. Karim"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="givenName"
            />
            <Field
              label="Ton email"
              placeholder="karim@mail.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={send}
            />
            {error && <Muted style={{ color: colors.danger }}>{error}</Muted>}
            <Button label="Recevoir mon code" busy={busy} disabled={!email.trim()} onPress={send} />
            <Muted style={{ fontSize: 13 }}>
              Pas de mot de passe : on t’envoie un code par email. Si tu as déjà un compte, tu retrouves tes groupes et tes
              stats.
            </Muted>
            <Muted style={{ fontSize: 12, lineHeight: 18 }}>
              En continuant, tu acceptes les{' '}
              <Text style={styles.link} onPress={goTerms}>
                conditions d’utilisation
              </Text>{' '}
              et la{' '}
              <Text style={styles.link} onPress={goPrivacy}>
                politique de confidentialité
              </Text>
              .
            </Muted>
          </View>
        ) : (
          <View style={{ gap: space(4) }}>
            <Body>
              Code envoyé à <Text style={{ fontFamily: fonts.bodySemi }}>{email.trim().toLowerCase()}</Text>. Pense à regarder
              dans les spams.
            </Body>
            <Field
              label="Code reçu par email"
              placeholder="123456"
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, '').slice(0, 10));
                setError(null);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              maxLength={10}
              style={styles.code}
              returnKeyType="done"
              onSubmitEditing={verify}
            />
            {error && <Muted style={{ color: colors.danger }}>{error}</Muted>}
            <Button label="Se connecter" busy={busy} disabled={code.length < 6} onPress={verify} />
            <View style={styles.row}>
              <Button
                small
                variant="ghost"
                label={cooldown > 0 ? `Renvoyer (${cooldown} s)` : 'Renvoyer le code'}
                disabled={cooldown > 0 || busy}
                onPress={send}
              />
              <Button
                small
                variant="ghost"
                label="Changer d’email"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              />
            </View>
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space(4), paddingTop: space(10) },
  title: { fontSize: 96, lineHeight: 92, fontFamily: fonts.displayBlack, letterSpacing: -2 },
  bibs: { flexDirection: 'row', gap: space(2) },
  bib: { width: 44, height: 10, borderRadius: 5 },
  lead: { fontSize: 18, lineHeight: 26, maxWidth: 340 },
  link: { color: colors.text, textDecorationLine: 'underline' },
  code: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 4, textAlign: 'center' },
  row: { flexDirection: 'row', gap: space(2), flexWrap: 'wrap' },
});
