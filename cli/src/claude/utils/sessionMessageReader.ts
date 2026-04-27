import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export interface SessionMessage {
    role: string
    content: unknown
    timestamp: number
}

export async function readSessionMessages(projectId: string, sessionId: string): Promise<SessionMessage[]> {
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const filePath = join(claudeConfigDir, 'projects', projectId, `${sessionId}.jsonl`)

    if (!existsSync(filePath)) return []

    let raw: string
    try {
        raw = await readFile(filePath, 'utf-8')
    } catch {
        return []
    }

    const messages: SessionMessage[] = []

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
            const parsed = JSON.parse(line)
            if (parsed.isSidechain) continue
            if (parsed.type !== 'user' && parsed.type !== 'assistant') continue
            if (!parsed.message || typeof parsed.message !== 'object') continue
            if (!parsed.message.role) continue

            const ts = parsed.timestamp ? new Date(parsed.timestamp).getTime() : Date.now()
            if (Number.isNaN(ts)) continue

            messages.push({
                role: parsed.message.role,
                content: parsed.message,
                timestamp: ts
            })
        } catch {
            // skip malformed lines
        }
    }

    messages.sort((a, b) => a.timestamp - b.timestamp)
    return messages
}
