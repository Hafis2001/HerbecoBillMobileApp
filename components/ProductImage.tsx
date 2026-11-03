/**
 * Product photo with a friendly herbal placeholder when no image is set.
 */

import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import theme from '../constants/theme';

const { colors, accentSoft } = { colors: theme.colors, accentSoft: theme.colors.accentSoft };

interface ProductImageProps {
  uri?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}

export function ProductImage({ uri, style, iconSize = 30 }: ProductImageProps) {
  if (uri) {
    return (
      <View style={[styles.wrap, style]}>
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={[styles.wrap, styles.placeholder, style]}>
      <Feather name="feather" size={iconSize} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: theme.colors.divider,
  },
  placeholder: {
    backgroundColor: accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default ProductImage;
