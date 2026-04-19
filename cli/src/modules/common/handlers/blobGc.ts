import { readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { logger } from '@/ui/logger'
import { getHapiBlobsDir } from '@/constants/uploadPaths'
import { isTrackedUploadDir } from './uploads'

const MAX_AGE_MS = 2 * 60 * 60 * 1000

export async function runBlobGC(): Promise<void> {
    const blobsDir = getHapiBlobsDir()
    let entries
    try {
        entries = await readdir(blobsDir, { withFileTypes: true })
    } catch {
        return
    }

    const now = Date.now()
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dirPath = join(blobsDir, entry.name)

        if (isTrackedUploadDir(dirPath)) continue

        try {
            const stats = await stat(dirPath)
            if (now - stats.mtimeMs > MAX_AGE_MS) {
                await rm(dirPath, { recursive: true, force: true })
                logger.debug('Blob GC: removed orphan directory:', dirPath)
            }
        } catch {
            // entry may have been removed concurrently
        }
    }
}
