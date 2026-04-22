import type { AgentEvent, AgentEventBlock, ChatBlock, NormalizedMessage } from '@/chat/types'

function parseClaudeUsageLimit(text: string): AgentEvent | null {
    const reachedMatch = text.match(/^Claude AI usage limit reached\|(\d+)(?:\|([^|]*))?$/)
    if (reachedMatch) {
        const timestamp = Number.parseInt(reachedMatch[1], 10)
        if (Number.isFinite(timestamp)) {
            return { type: 'limit-reached', endsAt: timestamp, limitType: reachedMatch[2] || '' }
        }
    }

    const warningMatch = text.match(/^Claude AI usage limit warning\|(\d+)\|(\d+)\|([^|]*)$/)
    if (warningMatch) {
        const timestamp = Number.parseInt(warningMatch[1], 10)
        const utilization = Number.parseInt(warningMatch[2], 10) / 100
        const limitType = warningMatch[3] || ''
        if (Number.isFinite(timestamp) && Number.isFinite(utilization)) {
            return { type: 'limit-warning', utilization, endsAt: timestamp, limitType }
        }
    }

    return null
}

export function parseMessageAsEvent(msg: NormalizedMessage): AgentEvent | null {
    if (msg.isSidechain) return null
    if (msg.role !== 'agent') return null

    for (const content of msg.content) {
        if (content.type === 'text') {
            const limitEvent = parseClaudeUsageLimit(content.text)
            if (limitEvent !== null) {
                return limitEvent
            }
        }
    }

    return null
}

export function dedupeAgentEvents(blocks: ChatBlock[]): ChatBlock[] {
    const result: ChatBlock[] = []
    let prevEventKey: string | null = null
    let prevTitleChangedTo: string | null = null

    for (const block of blocks) {
        if (block.kind !== 'agent-event') {
            result.push(block)
            prevEventKey = null
            prevTitleChangedTo = null
            continue
        }

        const event = block.event as { type: string; [key: string]: unknown }
        if (event.type === 'title-changed' && typeof event.title === 'string') {
            const title = event.title.trim()
            const key = `title-changed:${title}`
            if (key === prevEventKey) {
                continue
            }
            result.push(block)
            prevEventKey = key
            prevTitleChangedTo = title
            continue
        }

        if (event.type === 'message' && typeof event.message === 'string') {
            const message = event.message.trim()
            const key = `message:${message}`
            if (key === prevEventKey) {
                continue
            }
            if (prevTitleChangedTo && message === prevTitleChangedTo) {
                continue
            }
            result.push(block)
            prevEventKey = key
            prevTitleChangedTo = null
            continue
        }

        let key: string
        try {
            key = `event:${JSON.stringify(event)}`
        } catch {
            key = `event:${String(event.type)}`
        }

        if (key === prevEventKey) {
            continue
        }

        result.push(block)
        prevEventKey = key
        prevTitleChangedTo = null
    }

    return result
}

const COMPACTION_SUMMARY_THRESHOLD = 200

function isCompactionEvent(block: ChatBlock): boolean {
    if (block.kind !== 'agent-event') return false
    const event = block.event as { type: string; message?: string }
    if (event.type === 'compact' || event.type === 'microcompact') return true
    if (event.type === 'message' && typeof event.message === 'string') {
        const msg = event.message
        if (msg === 'Compaction started' || msg === 'Compaction completed') return true
        if (msg.length > COMPACTION_SUMMARY_THRESHOLD) return true
    }
    return false
}

function isCompactionSummary(block: ChatBlock): boolean {
    if (block.kind !== 'agent-event') return false
    const event = block.event as { type: string; message?: string }
    return event.type === 'message' && typeof event.message === 'string' && event.message.length > COMPACTION_SUMMARY_THRESHOLD
}

/**
 * Fold consecutive compaction events into a single block.
 * Prefers the summary block (long text that triggers the folded UI).
 */
export function foldCompactionEvents(blocks: ChatBlock[]): ChatBlock[] {
    const result: ChatBlock[] = []
    let i = 0

    while (i < blocks.length) {
        if (!isCompactionEvent(blocks[i])) {
            result.push(blocks[i])
            i++
            continue
        }

        let summaryBlock: ChatBlock | null = null
        let lastBlock = blocks[i]

        while (i < blocks.length && isCompactionEvent(blocks[i])) {
            if (isCompactionSummary(blocks[i])) {
                summaryBlock = blocks[i]
            }
            lastBlock = blocks[i]
            i++
        }

        result.push(summaryBlock ?? lastBlock)
    }

    return result
}

/**
 * Fold consecutive api-error events, keeping only the latest state.
 */
export function foldApiErrorEvents(blocks: ChatBlock[]): ChatBlock[] {
    const result: ChatBlock[] = []

    for (const block of blocks) {
        if (block.kind !== 'agent-event') {
            result.push(block)
            continue
        }

        const event = block.event as { type: string }
        if (event.type !== 'api-error') {
            result.push(block)
            continue
        }

        const prev = result[result.length - 1] as AgentEventBlock | undefined
        if (prev?.kind === 'agent-event' && (prev.event as { type: string }).type === 'api-error') {
            result[result.length - 1] = block
        } else {
            result.push(block)
        }
    }

    return result
}
