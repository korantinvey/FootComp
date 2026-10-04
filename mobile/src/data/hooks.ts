import { useMemo } from 'react';

import type { ID } from '@/domain/types';

import { useData } from './store';

export function useCurrentPlayer() {
  const data = useData();
  return data.players.find((p) => p.id === data.currentPlayerId) ?? null;
}

export function usePlayerNames() {
  const { players } = useData();
  return useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p.name]));
    return (id: ID | null | undefined) => (id ? (map.get(id) ?? 'Joueur supprimé') : '—');
  }, [players]);
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function formatDay(iso: string) {
  return dateFmt.format(new Date(iso));
}

export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso));
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}
