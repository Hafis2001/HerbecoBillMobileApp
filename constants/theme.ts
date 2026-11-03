/**
 * HERBECO design system.
 * The ONLY place where colours, spacing, radii and font families are defined.
 */

export const colors = {
  /** Deep herbal green — primary brand colour. */
  primary: '#1F6F43',
  primaryDark: '#155231',
  /** Fresh light green accent. */
  accent: '#A8D5A2',
  accentSoft: '#E7F1E5',
  /** Warm off-white app background. */
  background: '#F7F9F5',
  card: '#FFFFFF',
  text: '#1C2B24',
  textMuted: '#6B7C74',
  textOnPrimary: '#FFFFFF',
  /** Soft gold — totals, referral badges, highlights. */
  gold: '#C9A227',
  goldSoft: '#F6EFD8',
  border: '#E4EDE6',
  divider: '#EDF3EE',
  danger: '#C0392B',
  dangerSoft: '#FBEAE7',
  scrim: 'rgba(28, 43, 36, 0.35)',
  shimmer: '#EDF3EE',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 21,
  xxl: 28,
} as const;

/** Font families loaded in app/_layout.tsx via @expo-google-fonts/poppins. */
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

/** Shared soft card shadow (per-platform). */
export const cardShadow = {
  shadowColor: colors.text,
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const theme = { colors, spacing, radius, fontSize, fonts, cardShadow };
export default theme;
