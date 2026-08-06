/**
 * Provider selection: Supabase when EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY are
 * set, otherwise the bundled mock catalog — so the app always runs, and a
 * future Kroger adapter plugs in behind the same interface.
 */

import { mockProvider } from './mock/mock-provider';
import { isSupabaseConfigured } from './supabase/client';
import { supabaseProvider } from './supabase/supabase-provider';
import type { StoreDataProvider } from './types';

export const dataProvider: StoreDataProvider = isSupabaseConfigured()
  ? supabaseProvider
  : mockProvider;
