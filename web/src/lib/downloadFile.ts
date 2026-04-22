import type { ApiClient } from '@/api/client'

export async function downloadFileFromApi(
    api: ApiClient,
    sessionId: string,
    path: string,
    fileName: string
): Promise<void> {
    const res = await api.readSessionFile(sessionId, path)
    if (!res.success || !res.content) {
        throw new Error(res.error || 'Download failed')
    }
    const bytes = Uint8Array.from(atob(res.content), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
}
