/**
 * Responsive breakpoint hook.
 * isTablet: width >= 720 — 7"+ tablets / large screens
 * isLargeTablet: width >= 1000 — 10"+ tablets
 * maxContentWidth: max centered content width for forms/lists on tablets
 */
import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 720;
  const isLargeTablet = width >= 1000;
  const maxContentWidth = isLargeTablet ? 840 : isTablet ? 680 : undefined;
  return { width, height, isTablet, isLargeTablet, maxContentWidth };
}

export default useResponsive;
