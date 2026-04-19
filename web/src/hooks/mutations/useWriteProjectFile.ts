import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'

export function useWriteProjectFile(
    api: ApiClient | null,
    sessionId: string | null
): {
    writeProjectFile: (params: { path: string; content: string; overwrite?: boolean }) => Promise<void>
    isPending: boolean
    error: string | null
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (params: { path: string; content: string; overwrite?: boolean }) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            const res = await api.writeProjectFile(sessionId, params.path, params.content, params.overwrite)
            if (!res.success) {
                throw new Error(res.error ?? 'Failed to upload file')
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
        writeProjectFile: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : null,
    }
}
