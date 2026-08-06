import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PrimaryButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary';
}

export function PrimaryButton({ label, variant = 'primary', disabled, ...rest }: PrimaryButtonProps) {
  const theme = useTheme();
  const backgroundColor = variant === 'primary' ? theme.tint : theme.backgroundElement;
  const color = variant === 'primary' ? theme.onTint : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: pressed ? 0.85 : disabled ? 0.5 : 1 },
      ]}
      {...rest}
    >
      <ThemedText type="subtitle" style={[styles.label, { color }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minWidth: MinTouchTarget,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
  },
});
