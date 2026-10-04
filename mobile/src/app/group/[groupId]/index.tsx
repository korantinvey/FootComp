import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDay, formatTime, useCurrentPlayer, usePlayerNames } from '@/data/hooks';
import { repo, useData } from '@/data/store';
import { parseContact, type Contact } from '@/domain/contact';
import { hasPremium } from '@/domain/plan';
import { isAdmin, lineup } from '@/domain/rules';
import { computeStats } from '@/domain/stats';
import type { Group, ID } from '@/domain/types';
import { act } from '@/ui/act';
import { PlayerAvatar } from '@/ui/avatar';
import { Alert, type AlertButton } from '@/ui/dialog';
import { Body, Button, Card, Display, Empty, Eyebrow, Field, Muted, Screen, Section, Segmented, Tag } from '@/ui/kit';
import { sendInvite, shareInvite } from '@/ui/invite';
import { Locked, PlanBanner } from '@/ui/premium';
import { StatsTable, STATS_LEGEND } from '@/ui/stats-table';
import { colors, fonts, space } from '@/ui/theme';

type Tab = 'sessions' | 'players' | 'stats';

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const data = useData();
  const me = useCurrentPlayer();
  const [tab, setTab] = useState<Tab>('sessions');
  const group = data.groups.find((g) => g.id === groupId);

  if (!group || !me) {
    return (
      <Screen>
        <Empty title="Ce groupe n'existe plus." />
      </Screen>
    );
  }

  const admin = isAdmin(group, me.id);

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ gap: space(2) }}>
        <Eyebrow>
          {group.members.length} joueur{group.members.length > 1 ? 's' : ''}
          {admin ? ' · tu es admin' : ''}
        </Eyebrow>
        <Display>{group.name}</Display>
      </View>

      <PlanBanner group={group} admin={admin} />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sessions', label: 'Sessions' },
          { value: 'players', label: 'Joueurs' },
          { value: 'stats', label: 'Stats' },
        ]}
      />

      {tab === 'sessions' && <Sessions group={group} admin={admin} />}
      {tab === 'players' && <Players group={group} admin={admin} meId={me.id} />}
      {tab === 'stats' && (hasPremium(group) ? <Stats group={group} /> : <Locked group={group} admin={admin} />)}
    </Screen>
  );
}

function Sessions({ group, admin }: { group: Group; admin: boolean }) {
  const data = useData();
  const nameOf = usePlayerNames();
  const sessions = data.sessions.filter((s) => s.groupId === group.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Section
      title="Sessions"
      action={
        admin &&
        sessions.length > 0 && (
          <Button
            small
            variant="ghost"
            label="+ Nouveau match"
            onPress={() => router.push({ pathname: '/session/new', params: { groupId: group.id } })}
          />
        )
      }>
      {sessions.length === 0 ? (
        <Empty title="Pas encore de session">
          <Muted>
            {admin
              ? 'Invite tout le groupe au prochain match : les premiers à répondre présent sont inscrits, les suivants passent en liste d’attente.'
              : 'Un admin du groupe doit envoyer l’invitation pour le prochain match.'}
          </Muted>
          {admin && (
            <Button
              label="+ Nouveau match"
              onPress={() => router.push({ pathname: '/session/new', params: { groupId: group.id } })}
            />
          )}
        </Empty>
      ) : (
        sessions.map((s) => {
          const matches = data.matches.filter((m) => m.sessionId === s.id);
          const live = matches.some((m) => m.status === 'live');
          const { confirmed, waiting } = lineup(s);
          return (
            <Card key={s.id} onPress={() => router.push({ pathname: '/session/[sessionId]', params: { sessionId: s.id } })}>
              <View style={styles.sessionTop}>
                <Display style={styles.sessionDate}>{formatDay(s.date)}</Display>
                <Body style={styles.sessionTime}>{formatTime(s.date)}</Body>
                <View style={{ flex: 1 }} />
                {live ? (
                  <Tag label="En direct" color={colors.danger} />
                ) : s.status === 'open' ? (
                  <Tag label={confirmed.length >= s.capacity ? "Complet" : "Invitation en cours"} color={colors.highlight} />
                ) : (
                  <Tag label="Invitation close" />
                )}
              </View>
              <Muted>
                Foot à {s.format}
                {s.place ? ` · ${s.place}` : ''} · {confirmed.length}/{s.capacity} inscrits{waiting.length ? ` · ${waiting.length} en attente` : ''}
                {s.captainId ? ` · capitaine ${nameOf(s.captainId)}` : ''}
              </Muted>
            </Card>
          );
        })
      )}
    </Section>
  );
}

function Players({ group, admin, meId }: { group: Group; admin: boolean; meId: ID }) {
  const data = useData();
  const nameOf = usePlayerNames();
  const me = data.players.find((p) => p.id === meId);
  const [name, setName] = useState('');
  const [contactInput, setContactInput] = useState('');
  const contact = parseContact(contactInput);
  const contactInvalid = contactInput.trim().length > 0 && !contact;
  const members = [...group.members].sort(
    (a, b) => (a.role === b.role ? nameOf(a.playerId).localeCompare(nameOf(b.playerId)) : a.role === 'admin' ? -1 : 1),
  );
  const invited = members.filter((m) => m.status === 'invited').length;

  const run = (fn: () => Promise<unknown>) => act(fn);

  const [busy, setBusy] = useState<'add' | 'share' | null>(null);
  const inviter = me?.name ?? 'Un ami';

  /** Adds the player, then sends the invitation by email or through the share sheet. */
  const invite = async (via: 'add' | 'share') => {
    if (!name.trim() || contactInvalid || busy) return;
    setBusy(via);
    const added = await act(() => repo.addMember(group.id, name, contact));
    setBusy(null);
    if (!added) return;
    setName('');
    setContactInput('');
    try {
      if (via === 'share') await shareInvite(group, inviter);
      else if (contact) await sendInvite(contact, group, inviter);
    } catch {
      Alert.alert('Invitation non envoyée', 'Aucune app n’a pu s’ouvrir. Réessaie avec « Partager ».');
    }
  };

  const playerContact = (playerId: ID): Contact | null => {
    const p = data.players.find((x) => x.id === playerId);
    if (p?.email) return { kind: 'email', value: p.email };
    return null;
  };

  const openProfile = (playerId: ID) =>
    router.push({ pathname: '/player/[playerId]', params: { playerId, groupId: group.id } });

  const manage = (playerId: ID) => {
    const m = group.members.find((x) => x.playerId === playerId)!;
    const c = playerContact(playerId);
    const actions: AlertButton[] = [];
    if (m.status === 'invited') {
      if (c) actions.push({ text: 'Renvoyer par email', onPress: () => sendInvite(c, group, inviter).catch(() => {}) });
      actions.push({ text: 'Partager l’invitation', onPress: () => shareInvite(group, inviter).catch(() => {}) });
    }
    actions.push(
      m.role === 'admin'
        ? { text: 'Retirer le rôle admin', onPress: () => run(() => repo.setRole(group.id, playerId, 'member')) }
        : { text: 'Nommer admin', onPress: () => run(() => repo.setRole(group.id, playerId, 'admin')) },
      { text: 'Retirer du groupe', style: 'destructive', onPress: () => run(() => repo.removeMember(group.id, playerId)) },
      { text: 'Voir la fiche', onPress: () => openProfile(playerId) },
      { text: 'Fermer', style: 'cancel' },
    );
    Alert.alert(nameOf(playerId), c ? c.value : m.role === 'admin' ? 'Admin du groupe' : 'Joueur du groupe', actions);
  };

  return (
    <View style={{ gap: space(6) }}>
      {admin && (
        <Section title="Inviter un joueur">
          <View style={{ gap: space(3) }}>
            <Field label="Nom" placeholder="Ex. Yanis" value={name} onChangeText={setName} autoCapitalize="words" />
            <Field
              label="Email (facultatif)"
              placeholder="yanis@mail.com"
              value={contactInput}
              onChangeText={setContactInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={() => invite('add')}
            />
            {contactInvalid && <Muted style={{ color: colors.danger }}>Écris une adresse email valide.</Muted>}
            <View style={styles.inviteRow}>
              <Button
                style={{ flex: 1 }}
                label={contact ? 'Inviter par email' : 'Ajouter'}
                variant={contact ? 'primary' : 'ghost'}
                disabled={!name.trim() || contactInvalid || !!busy}
                busy={busy === 'add'}
                onPress={() => invite('add')}
              />
              <Button
                style={{ flex: 1 }}
                label="Partager"
                variant={contact ? 'ghost' : 'primary'}
                disabled={!name.trim() || contactInvalid || !!busy}
                busy={busy === 'share'}
                onPress={() => invite('share')}
              />
            </View>
            <Muted style={{ fontSize: 13 }}>
              « Partager » ouvre WhatsApp, Messenger, Messages… avec l’invitation prête.{' '}
              {contact
                ? '« Inviter par email » ouvre ton app mail.'
                : '« Ajouter » inscrit le joueur sans rien lui envoyer.'}
            </Muted>
          </View>

          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Muted style={{ fontSize: 13 }}>Code d’invitation</Muted>
                <Text style={styles.code}>{group.inviteCode}</Text>
              </View>
              <Button small label="Partager" onPress={() => shareInvite(group, me?.name ?? 'Un ami').catch(() => {})} />
            </View>
            <Muted style={{ fontSize: 13 }}>Envoie le lien dans la conversation WhatsApp du groupe : chacun rejoint en un clic.</Muted>
          </Card>

        </Section>
      )}

      <Section title={`Effectif · ${group.members.length}${invited ? ` · ${invited} invité${invited > 1 ? 's' : ''}` : ''}`}>
        {admin && <Muted>Touche un joueur pour relancer son invitation, le nommer admin ou le retirer du groupe.</Muted>}
        {members.map((m) => (
          <Card key={m.playerId} onPress={() => (admin ? manage(m.playerId) : openProfile(m.playerId))} style={styles.memberRow}>
            <PlayerAvatar playerId={m.playerId} size={36} />
            <Body style={{ flex: 1, color: m.status === 'invited' ? colors.textMuted : colors.text }}>
              {nameOf(m.playerId)}
              {m.playerId === meId ? ' (toi)' : ''}
            </Body>
            {m.status === 'invited' && <Tag label="Invité" />}
            {m.role === 'admin' && <Tag label="Admin" color={colors.highlight} />}
          </Card>
        ))}
      </Section>
    </View>
  );
}

function Stats({ group }: { group: Group }) {
  const data = useData();
  const nameOf = usePlayerNames();
  const matches = useMemo(() => data.matches.filter((m) => m.groupId === group.id), [data.matches, group.id]);
  const finished = matches.filter((m) => m.status === 'finished').length;
  const stats = useMemo(
    () => computeStats(matches, group.members.map((m) => m.playerId)),
    [matches, group.members],
  );

  if (finished === 0) {
    return (
      <Empty title="Pas encore de stats">
        <Muted>Les stats apparaissent dès qu’un match est terminé : victoires, buts, passes décisives et points MVP.</Muted>
      </Empty>
    );
  }

  return (
    <Section title={`${finished} match${finished > 1 ? 's' : ''} terminé${finished > 1 ? 's' : ''}`}>
      <Muted>Touche une colonne pour trier.</Muted>
      <StatsTable
        stats={stats}
        nameOf={nameOf}
        onPlayer={(id) => router.push({ pathname: '/player/[playerId]', params: { playerId: id, groupId: group.id } })}
      />
      <Muted style={{ fontSize: 12, lineHeight: 18 }}>{STATS_LEGEND}</Muted>
    </Section>
  );
}

const styles = StyleSheet.create({
  sessionTop: { flexDirection: 'row', alignItems: 'baseline', gap: space(2), flexWrap: 'wrap' },
  sessionDate: { fontSize: 28, lineHeight: 30 },
  sessionTime: { color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  inviteRow: { flexDirection: 'row', gap: space(2) },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  code: { fontFamily: fonts.displayBlack, fontSize: 32, letterSpacing: 4, color: colors.text },
});
