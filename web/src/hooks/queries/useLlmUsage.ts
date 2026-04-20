import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export type LlmUsageWeekEntry = {
    date: string
    day: string
    spend: string
}

export type LlmUsageData = {
    updated: string
    today: string
    today_spend: string
    week: LlmUsageWeekEntry[]
    week_total: string
    receivedAt: number
}

export type LlmUsageResponse = {
    data: LlmUsageData | null
    stale: boolean
}

export function useLlmUsage(api: ApiClient | null) {
    return useQuery({
        queryKey: queryKeys.llmUsage,
        queryFn: async (): Promise<LlmUsageResponse> => {
            if (!api) throw new Error('API unavailable')
            return await api.getLlmUsage()
        },
        enabled: Boolean(api),
        refetchInterval: 30_000,
    })
}
