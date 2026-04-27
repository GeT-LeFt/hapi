import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readdir, stat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { LocalSession } from '@hapi/protocol/types'

function reverseProjectPath(encodedDir: string): string {
    const candidate = encodedDir.replace(/^-/, '/').replace(/-/g, '/')
    if (existsSync(candidate)) return candidate
    return encodedDir
}

function extractPreview(lines: string[]): string | undefined {
    for (const line of lines) {
        if (!line.trim()) continue
        try {
            const parsed = JSON.parse(line)
            if (parsed.type === 'human' || parsed.role === 'user') {
                const text = typeof parsed.message === 'string'
                    ? parsed.message
                    : typeof parsed.message?.content === 'string'
                        ? parsed.message.content
                        : Array.isArray(parsed.message?.content)
                            ? parsed.message.content.find((b: any) => b.type === 'text')?.text
                            : undefined
                if (text && typeof text === 'string') {
                    return text.slice(0, 100)
                }
            }
        } catch {
            // skip malformed lines
        }
    }
    return undefined
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MIN_FILE_SIZE = 1024
const MAX_RESULTS = 50

export async function discoverLocalSessions(): Promise<LocalSession[]> {
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const projectsDir = join(claudeConfigDir, 'projects')

    if (!existsSync(projectsDir)) return []

    const results: LocalSession[] = []
    const cutoff = Date.now() - MAX_AGE_MS

    let projectDirs: string[]
    try {
        projectDirs = await readdir(projectsDir)
    } catch {
        return []
    }

    for (const projectId of projectDirs) {
        const projectDir = join(projectsDir, projectId)
        let dirStat
        try {
            dirStat = await stat(projectDir)
        } catch { continue }
        if (!dirStat.isDirectory()) continue

        let files: string[]
        try {
            files = await readdir(projectDir)
        } catch { continue }

        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

        for (const file of jsonlFiles) {
            const filePath = join(projectDir, file)
            const sessionId = file.replace(/\.jsonl$/, '')

            let fileStat
            try {
                fileStat = await stat(filePath)
            } catch { continue }

            if (fileStat.size < MIN_FILE_SIZE) continue
            if (fileStat.mtimeMs < cutoff) continue

            let preview: string | undefined
            try {
                const content = await readFile(filePath, 'utf-8')
                const lines = content.split('\n').slice(0, 30)
                preview = extractPreview(lines)
            } catch {
                // skip preview on error
            }

            results.push({
                sessionId,
                projectPath: reverseProjectPath(projectId),
                projectId,
                lastModified: fileStat.mtimeMs,
                fileSize: fileStat.size,
                preview
            })
        }
    }

    results.sort((a, b) => b.lastModified - a.lastModified)
    return results.slice(0, MAX_RESULTS)
}
