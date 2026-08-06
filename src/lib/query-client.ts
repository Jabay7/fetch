import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client. Search results stay fresh for a minute and
 * cached for ten, so going offline still shows the last results, repeated
 * searches are instant, and a store switch (new query key) refetches cleanly.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
