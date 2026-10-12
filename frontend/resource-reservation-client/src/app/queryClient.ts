import { QueryClient } from '@tanstack/react-query'

// Server data is cached per query key (see lib/queryKeys.ts). These defaults
// keep the app's behaviour from before TanStack Query:
// - Data loads once and stays until a change in this app invalidates it, or
//   the page is reloaded. There is no refetch on window focus or reconnect.
// - Errors show straight away. A failed request isn't retried.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
