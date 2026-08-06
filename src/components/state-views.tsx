/**
 * Friendly empty / loading / error / offline states, shared by all screens.
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

export function CenteredState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IoniconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.centered} accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name={icon} size={30} color={theme.textSecondary} />
      </View>
      <ThemedText type="subtitle" style={styles.centerText} accessibilityRole="header">
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {body}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Searching…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={theme.tint} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body = 'Please check your connection and try again.',
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <CenteredState
      icon="cloud-offline-outline"
      title={title}
      body={body}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

export function OfflineBanner() {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel="You are offline. Results may be out of date."
      style={[styles.banner, { backgroundColor: theme.warningBg }]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={theme.warningText} />
      <ThemedText type="caption" style={{ color: theme.warningText, flex: 1 }}>
        You&apos;re offline. Results may be out of date.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
    maxWidth: 300,
  },
  action: {
    marginTop: Spacing.one,
    alignSelf: 'stretch',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
