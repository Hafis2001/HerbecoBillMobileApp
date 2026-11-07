/**
 * Add / edit product screen.
 * Photo (camera or gallery, persisted into documentDirectory), name,
 * segmented Kg/Unit selector and unit price. Validated with zod.
 */

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Feather, Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { makeId, useProductStore } from '../store/productStore';
import type { Unit } from '../types';
import { PrimaryButton } from '../components/PrimaryButton';
import { showToast } from '../components/Toast';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

/** Form schema — strings as typed; zod converts + validates on submit. */
const formSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  unit: z.enum(['kg', 'unit']),
  price: z
    .string()
    .trim()
    .min(1, 'Price is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount like 250 or 99.50')
    .refine((v) => Number(v) > 0, 'Price must be greater than 0'),
});

type FormValuesRaw = z.infer<typeof formSchema>;
interface FormValues {
  name: string;
  unit: Unit;
  price: string;
}

/** Copies a picked image into app documents so it survives app restarts. */
async function persistImage(sourceUri: string): Promise<string> {
  try {
    const dir = `${FileSystem.documentDirectory}herbeco`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}/${makeId()}.jpg`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    return sourceUri; // fall back to the original cached uri
  }
}

export default function AddProductScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === 'string' ? id : undefined;
  const editing = useProductStore((s) =>
    editingId ? s.products.find((p) => p.id === editingId) : undefined,
  );
  const { addProduct, updateProduct } = useProductStore.getState();
  const insets = useSafeAreaInsets();

  const [imageUri, setImageUri] = useState<string | undefined>(editing?.imageUri);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValuesRaw>({
    defaultValues: {
      name: editing?.name ?? '',
      unit: editing?.unit ?? 'kg',
      price: editing ? String(editing.price) : '',
    },
    mode: 'onChange',
  });

  const pickImage = async (useCamera: boolean) => {
    const hasPermission = useCamera
      ? (await ImagePicker.requestCameraPermissionsAsync()).granted
      : (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;

    if (!hasPermission) {
      Alert.alert(
        'Permission needed',
        'Please allow camera/photo access from Settings to add product photos.',
        [{ text: 'OK' }],
      );
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: true,
          aspect: [1, 1],
        });

    if (!result.canceled && result.assets[0]) {
      const persisted = await persistImage(result.assets[0].uri);
      setImageUri(persisted);
    }
  };

  const onSubmit = handleSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      unit: values.unit as Unit,
      price: Number(values.price),
      imageUri,
    };
    if (editingId && editing) {
      updateProduct(editingId, payload);
      showToast('Product updated');
    } else {
      addProduct(payload);
      showToast('Product saved');
    }
    router.back();
  });

  const cancel = () => router.back();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={cancel} accessibilityLabel="Go back" hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? 'Edit Product' : 'Add Product'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + spacing.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
        {/* Photo picker with preview / placeholder */}
        <View style={styles.photoSection}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} />
          ) : (
            <View style={[styles.preview, styles.previewPlaceholder]}>
              <Feather name="feather" size={34} color={colors.primary} />
              <Text style={styles.phText}>No photo yet</Text>
            </View>
          )}
          <View style={styles.photoButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void pickImage(true)}
              style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void pickImage(false)}
              style={({ pressed }) => [
                styles.photoBtn,
                { backgroundColor: colors.accentSoft },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </Pressable>
            {imageUri ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setImageUri(undefined)}
                style={({ pressed }) => [
                  styles.photoBtn,
                  { backgroundColor: colors.dangerSoft },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="close" size={18} color={colors.danger} />
                <Text style={[styles.photoBtnText, { color: colors.danger }]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Name */}
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Product name</Text>
              <View style={[styles.inputWrap, Boolean(errors.name) && { borderColor: colors.danger }]}>
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Ashwagandha Powder"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>
              {errors.name ? (
                <Text style={styles.error}>{errors.name.message}</Text>
              ) : null}
            </View>
          )}
        />

        {/* Category / selling unit segmented selector */}
        <Controller
          control={control}
          name="unit"
          render={({ field: { onChange, value } }) => (
            <View style={[styles.field, styles.unitField]}>
              <Text style={styles.label}>Category / selling unit</Text>
              <View style={styles.segmented}>
                <Pressable
                  onPress={() => onChange('kg')}
                  style={[styles.segBtn, value === 'kg' && styles.segBtnActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === 'kg' }}
                >
                  <Text style={[styles.segText, value === 'kg' && styles.segTextActive]}>
                    Kg{'\n'}sold by weight (0.5 allowed)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onChange('unit')}
                  style={[styles.segBtn, value === 'unit' && styles.segBtnActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === 'unit' }}
                >
                  <Text style={[styles.segText, value === 'unit' && styles.segTextActive]}>
                    Unit{'\n'}whole pieces only
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        />

        {/* Unit price */}
        <Controller
          control={control}
          name="price"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Unit price (₹ per kg / per unit)</Text>
              <View style={[styles.inputWrap, Boolean(errors.price) && { borderColor: colors.danger }]}>
                <Text style={styles.prefix}>₹</Text>
                <TextInput
                  value={value}
                  onChangeText={(v) => onChange(v.replace(/[^\d.]/g, ''))}
                  onBlur={onBlur}
                  placeholder="e.g. 250"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              {errors.price ? (
                <Text style={styles.error}>{errors.price.message}</Text>
              ) : null}
            </View>
          )}
        />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <PrimaryButton
            title={editing ? 'Save changes' : 'Save product'}
            onPress={onSubmit}
            disabled={!isValid}
            icon="check"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm + 4,
    minHeight: 56,
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  form: {
    paddingHorizontal: spacing.md,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  preview: {
    width: 148,
    height: 148,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...cardShadow,
  },
  previewPlaceholder: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: spacing.xs,
  },
  phText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoBtnText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  field: {
    marginBottom: spacing.sm,
  },
  unitField: {
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  prefix: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
    padding: 0,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.danger,
    fontFamily: fonts.regular,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  segTextActive: {
    color: colors.textOnPrimary,
  },
  footer: {
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
});
