import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
  getAvailabilityRules,
  updateAvailabilityRule,
} from '../../api/availabilityRulesApi'
import type { CreateAvailabilityRuleRequest } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

// Weekly availability rules, such as Monday 08:00-16:00.
export function useAvailabilityRules() {
  return useQuery({ queryKey: queryKeys.availabilityRules, queryFn: getAvailabilityRules })
}

export interface SaveAvailabilityRuleInput {
  id: number | null
  request: CreateAvailabilityRuleRequest
}

// A rule changes what the booking schedule offers.
function useInvalidateRuleData() {
  return useInvalidateQueries(queryKeys.availabilityRules, queryKeys.schedules)
}

export function useSaveAvailabilityRule() {
  const invalidate = useInvalidateRuleData()

  return useMutation({
    mutationFn: async ({ id, request }: SaveAvailabilityRuleInput) => {
      if (id === null) {
        await createAvailabilityRule(request)
      } else {
        await updateAvailabilityRule(id, request)
      }
    },
    onSuccess: invalidate,
  })
}

export function useDeleteAvailabilityRule() {
  const invalidate = useInvalidateRuleData()

  return useMutation({
    mutationFn: (id: number) => deleteAvailabilityRule(id),
    onSuccess: invalidate,
  })
}
