import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import type { Contact } from '@/domain/contact';
import type { Group } from '@/domain/types';

/** Page that sends people to the right store. Fill once the app is published. */
export const DOWNLOAD_URL = 'https://[TON-DOMAINE]/app';

export function inviteLink(group: Group) {
  return Linking.createURL(`join/${group.inviteCode}`);
}

export function inviteMessage(group: Group, inviterName: string) {
  return [
    `${inviterName} t’invite à rejoindre « ${group.name} » sur FootComp pour organiser vos matchs.`,
    `1. Installe l’app : ${DOWNLOAD_URL}`,
    `2. Rejoins le groupe : ${inviteLink(group)}`,
    `ou entre le code ${group.inviteCode} dans l’app.`,
  ].join('\n');
}

/** Opens the mail app with the invitation ready to send. */
export async function sendInvite(contact: Contact, group: Group, inviterName: string) {
  const body = encodeURIComponent(inviteMessage(group, inviterName));
  const url = `mailto:${contact.value}?subject=${encodeURIComponent(`Invitation · ${group.name}`)}&body=${body}`;
  await Linking.openURL(url);
}

/** Share sheet: WhatsApp, Messenger, the group chat… */
export function shareInvite(group: Group, inviterName: string) {
  return Share.share({ message: inviteMessage(group, inviterName) });
}
