import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SearchBarProps extends Pick<TextInputProps, 'autoFocus' | 'onSubmitEditing'> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}

/** Large, obvious search input — the primary control of the app. */
export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar(
  { value, onChangeText, placeholder, accessibilityLabel, ...rest },
  ref
) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <Ionicons name="search" size={20} color={theme.textSecondary} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="search"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        {...rest}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={styles.clearButton}
        >
          <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: Spacing.two,
  },
  clearButton: {
    minWidth: MinTouchTarget / 2,
    minHeight: MinTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
