import type { AgentState } from '@/types/api'
import type { ChatBlock, NormalizedMessage, UsageData } from '@/chat/types'
import { traceMessages, type TracedMessage } from '@/chat/tracer'
import { dedupeAgentEvents, foldApiErrorEvents, foldCompactionEvents } from '@/chat/reducerEvents'
import { collectTitleChanges, collectToolIdsFromMessages, ensureToolBlock, getPermissions } from '@/chat/reducerTools'
import { reduceTimeline } from '@/chat/reducerTimeline'

// Calculate context size from usage data
function calculateContextSize(usage: UsageData): number {
    return (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0) + usage.input_tokens
}

export type LatestUsage = {
    inputTokens: number
    outputTokens: number
    cacheCreation: number
    cacheRead: number
    contextSize: number
    timestamp: number
}

export function reduceChatBlocks(
    normalized: NormalizedMessage[],
    agentState: AgentState | null | undefined
): { blocks: ChatBlock[]; hasReadyEvent: boolean; latestUsage: LatestUsage | null } {
    const permissionsById = getPermissions(agentState)
    const toolIdsInMessages = collectToolIdsFromMessages(normalized)
    const titleChangesByToolUseId = collectTitleChanges(normalized)

    const traced = traceMessages(normalized)
    const groups = new Map<string, TracedMessage[]>()
    const root: TracedMessage[] = []

    for (const msg of traced) {
        if (msg.sidechainId) {
            const existing = groups.get(msg.sidechainId) ?? []
            existing.push(msg)
            groups.set(msg.sidechainId, existing)
        } else {
            root.push(msg)
        }
    }

    const consumedGroupIds = new Set<string>()
    const emittedTitleChangeToolUseIds = new Set<string>()
    const reducerContext = { permissionsById, groups, consumedGroupIds, titleChangesByToolUseId, emittedTitleChangeToolUseIds }
    const rootResult = reduceTimeline(root, reducerContext)
    let hasReadyEvent = rootResult.hasReadyEvent

    // Only create permission-only tool cards when there is no tool call/result in the transcript.
    // Also skip if the permission is older than the oldest message in the current view,
    // to avoid mixing old tool cards with newer messages when paginating.
    const oldestMessageTime = normalized.length > 0
        ? Math.min(...normalized.map(m => m.createdAt))
        : null

    for (const [id, entry] of permissionsById) {
        if (toolIdsInMessages.has(id)) continue
        if (rootResult.toolBlocksById.has(id)) continue

        const createdAt = entry.permission.createdAt ?? Date.now()

        // Skip non-pending permissions that are older than the oldest message in the current view.
        // These will be shown when the user loads older messages.
        // Pending permissions are always shown so the user can approve/deny them.
        if (oldestMessageTime !== null && createdAt < oldestMessageTime && entry.permission.status !== 'pending') {
            continue
        }

        const block = ensureToolBlock(rootResult.blocks, rootResult.toolBlocksById, id, {
            createdAt,
            localId: null,
            name: entry.toolName,
            input: entry.input,
            description: null,
            permission: entry.permission
        })

        if (entry.permission.status === 'approved') {
            block.tool.state = 'completed'
            block.tool.completedAt = entry.permission.completedAt ?? createdAt
            if (block.tool.result === undefined) {
                block.tool.result = 'Approved'
            }
        } else if (entry.permission.status === 'denied' || entry.permission.status === 'canceled') {
            block.tool.state = 'error'
            block.tool.completedAt = entry.permission.completedAt ?? createdAt
            if (block.tool.result === undefined && entry.permission.reason) {
                block.tool.result = { error: entry.permission.reason }
            }
        }
    }

    // Calculate cumulative usage across all messages and latest context size
    let latestUsage: LatestUsage | null = null
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheCreation = 0
    let totalCacheRead = 0
    let latestContextSize = 0
    let latestTimestamp = 0
    for (const msg of normalized) {
        if (msg.usage) {
            totalInputTokens += msg.usage.input_tokens
            totalOutputTokens += msg.usage.output_tokens
            totalCacheCreation += msg.usage.cache_creation_input_tokens ?? 0
            totalCacheRead += msg.usage.cache_read_input_tokens ?? 0
            latestContextSize = calculateContextSize(msg.usage)
            latestTimestamp = msg.createdAt
        }
    }
    if (latestTimestamp > 0) {
        latestUsage = {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheCreation: totalCacheCreation,
            cacheRead: totalCacheRead,
            contextSize: latestContextSize,
            timestamp: latestTimestamp
        }
    }

    return { blocks: dedupeAgentEvents(foldCompactionEvents(foldApiErrorEvents(rootResult.blocks))), hasReadyEvent, latestUsage }
}
