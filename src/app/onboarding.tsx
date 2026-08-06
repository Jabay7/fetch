import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setHasOnboarded } from '@/lib/onboarding';

type IoniconName = keyof typeof Ionicons.glyphMap;

const SLIDES: { icon: IoniconName; title: string; body: string }[] = [
  {
    icon: 'search',
    title: 'Find it fast',
    body: 'Search any product and see the exact aisle before you walk the store.',
  },
  {
    icon: 'storefront-outline',
    title: 'Your store, your aisles',
    body: 'Aisle numbers differ at every location, so Fetch only shows the store you picked — until you change it.',
  },
  {
    icon: 'bookmark-outline',
    title: 'Save your staples',
    body: 'Keep frequent buys one tap away and see where they sit today. No account needed.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = () => {
    setHasOnboarded();
    router.replace('/store-picker');
  };

  const goTo = (target: number) => {
    const node = scrollRef.current;
    if (!node) return;
    if (Platform.OS === 'web') {
      // On web the ref resolves to the DOM element, RN-style scrollTo args are
      // passed through unconverted, and smooth scrolling is cancelled by the
      // mandatory snap — assign scrollLeft directly and track index in state.
      const el = ((node as { getScrollableNode?: () => unknown }).getScrollableNode?.() ??
        node) as unknown as { scrollLeft: number };
      el.scrollLeft = target * width;
      setIndex(target);
    } else {
      node.scrollTo({ x: target * width, animated: true });
    }
  };

  const next = () => {
    if (index >= SLIDES.length - 1) {
      finish();
    } else {
      goTo(index + 1);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.skipRow}>
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          hitSlop={8}
          style={styles.skip}
        >
          <ThemedText type="smallBold" themeColor="textSecondary">
            Skip
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(event) =>
          setIndex(
            Math.min(
              SLIDES.length - 1,
              Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)),
            ),
          )
        }
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: theme.tint }]}>
              <Ionicons name={slide.icon} size={40} color={theme.onTint} />
            </View>
            <ThemedText type="title" style={styles.slideTitle} accessibilityRole="header">
              {slide.title}
            </ThemedText>
            <ThemedText
              type="default"
              themeColor="textSecondary"
              style={styles.slideBody}
            >
              {slide.body}
            </ThemedText>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.title}
              style={[
                styles.dot,
                {
                  backgroundColor: dotIndex === index ? theme.tint : theme.border,
                  width: dotIndex === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <PrimaryButton
          label={index >= SLIDES.length - 1 ? 'Choose your store' : 'Next'}
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
  },
  skip: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  slideTitle: {
    textAlign: 'center',
  },
  slideBody: {
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    height: 8,
    borderRadius: Radius.pill,
  },
});
