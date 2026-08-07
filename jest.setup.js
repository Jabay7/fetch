/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-image's DOM observer integration doesn't initialize under jest-expo;
// render it as a plain RN Image so component tests can mount product tiles.
jest.mock('expo-image', () => {
  const { Image } = require('react-native');
  return { Image };
});
