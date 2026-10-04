/**
 * "Gazon clair": white surfaces, turf green for actions, and the two training
 * bibs (orange / indigo) as team colours.
 */
export const colors = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfacePressed: '#EEF1F4',
  text: '#0F172A',
  textMuted: '#64748B',
  line: '#E5E7EB',
  lineStrong: '#CBD5E1',
  primary: '#12A150',
  primarySoft: '#E7F6EE',
  highlight: '#0B7A3B',
  teamA: '#F26B00',
  teamB: '#4F46E5',
  danger: '#DC2626',
  onFill: '#FFFFFF',
  pitch: '#12A150',
  pitchStripe: '#109447',
} as const;

export const teamColor = (team: 'A' | 'B') => (team === 'A' ? colors.teamA : colors.teamB);

export const fonts = {
  display: 'Outfit_800ExtraBold',
  displayBlack: 'Outfit_900Black',
  displayMedium: 'Outfit_600SemiBold',
  body: 'Outfit_400Regular',
  bodyMedium: 'Outfit_500Medium',
  bodySemi: 'Outfit_600SemiBold',
  bodyBold: 'Outfit_700Bold',
} as const;

export const space = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
