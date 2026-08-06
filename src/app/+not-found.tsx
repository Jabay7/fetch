import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet } from 'react-native';

import { CenteredState } from '@/components/state-views';
import { useTheme } from '@/hooks/use-theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <CenteredState
        icon="compass-outline"
        title="This page doesn't exist"
        body="Let's get you back to product search."
        actionLabel="Go to search"
        onAction={() => router.replace('/')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
  },
});
