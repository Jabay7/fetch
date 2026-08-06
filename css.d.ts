// Allows side-effect imports of CSS (web-only styles) in TypeScript.
// `expo start` also generates expo-env.d.ts with equivalent declarations;
// this file keeps `tsc --noEmit` green without running Metro first.
declare module '*.css';
