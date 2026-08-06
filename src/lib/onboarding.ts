import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDED_KEY = 'fetch.onboarded.v1';

export async function getHasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setHasOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
  } catch (error) {
    console.warn('[fetch] Failed to persist onboarding flag', error);
  }
}
