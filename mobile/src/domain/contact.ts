/** Invitations go by email (SMS left out for now: it costs per message). */
export type Contact = { kind: 'email'; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseContact(input: string): Contact | null {
  const raw = input.trim();
  return EMAIL.test(raw) ? { kind: 'email', value: raw.toLowerCase() } : null;
}
