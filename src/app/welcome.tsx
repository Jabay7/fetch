import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <View style={[styles.brandMark, { backgroundColor: theme.tint }]}>
          <Ionicons name="search" size={44} color={theme.onTint} />
        </View>
        <ThemedText type="display" accessibilityRole="header">
          Fetch
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
          Find any product in your store — exact aisle, section, and availability in
          seconds.
        </ThemedText>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label="Choose your store"
          onPress={() => router.push('/store-picker')}
        />
        <ThemedText type="caption" themeColor="textSecondary" style={styles.footnote}>
          Your store stays selected until you change it.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    padding: Spacing.four,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  brandMark: {
    width: 96,
    height: 96,
    borderRadius: Radius.xl + 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  tagline: {
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  footnote: {
    textAlign: 'center',
  },
});
