import type { Group } from './types';

export const TRIAL_DAYS = 30;

export type Access = 'trial' | 'subscribed' | 'free';

/**
 * Per-group billing: the first month unlocks everything, then only an active
 * subscription does. Without one, the group can still invite and register.
 */
export function accessOf(group: Group, now = Date.now()): Access {
  if (group.subscribedUntil && new Date(group.subscribedUntil).getTime() > now) return 'subscribed';
  if (!group.trialRevoked && new Date(group.trialEndsAt).getTime() > now) return 'trial';
  return 'free';
}

/** Compo, live match, MVP votes and stats. */
export function hasPremium(group: Group, now = Date.now()) {
  return accessOf(group, now) !== 'free';
}

export function trialDaysLeft(group: Group, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(group.trialEndsAt).getTime() - now) / 86400e3));
}
