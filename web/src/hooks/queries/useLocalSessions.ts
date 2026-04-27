import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { useAppContext } from '@/lib/app-context'

export function useLocalSessions() {
    const { api } = useAppContext()

    return useQuery({
        queryKey: queryKeys.localSessions,
        queryFn: () => api!.getLocalSessions(),
        enabled: false,
    })
}
