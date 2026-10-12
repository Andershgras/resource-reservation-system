import { useQueryClient, type QueryKey } from '@tanstack/react-query'

// Returns a function that marks the given data as out of date. Data on screen
// reloads straight away, and the promise resolves once it has. Anything else
// reloads the next time a screen shows it.
export function useInvalidateQueries(...queryKeys: QueryKey[]) {
  const queryClient = useQueryClient()

  return () => Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
