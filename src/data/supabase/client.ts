/**
 * Lazy Supabase client. The URL and anon key come from EXPO_PUBLIC_ env
 * vars — the anon key is a publishable key by design; row-level security
 * on the database restricts it to read-only catalog access. No privileged
 * secret ever ships in the app bundle.
 */

import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured');
  }
  client ??= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
