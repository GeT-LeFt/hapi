import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'

export function useCreateDirectory(
    api: ApiClient | null,
    sessionId: string | null
): {
    createDirectory: (path: string) => Promise<void>
    isPending: boolean
    error: string | null
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (path: string) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            const res = await api.createDirectory(sessionId, path)
            if (!res.success) {
                throw new Error(res.error ?? 'Failed to create directory')
            }
        },
        onSuccess: () => {
            if (!sessionId) return
            void queryClient.invalidateQueries({
                queryKey: ['session-directory', sessionId]
            })
        },
    })

    return {
        createDirectory: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : null,
    }
}
