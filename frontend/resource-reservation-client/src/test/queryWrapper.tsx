import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createQueryClient } from '../app/queryClient'

// A fresh query client with the app's defaults, and a wrapper for renderHook.
export function createQueryWrapper() {
  const queryClient = createQueryClient()

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { queryClient, wrapper }
}
