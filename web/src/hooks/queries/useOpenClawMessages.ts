import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { OpenClawMessage } from '@hapi/protocol/types'
import type { ApiClient } from '@/api/client'
import type { OpenClawMessagesResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

const OPENCLAW_MESSAGES_PAGE_SIZE = 50

type OpenClawMessageWindowState = {
    messages: OpenClawMessage[]
    hasMore: boolean
    nextBeforeSeq: number | null
    hasLoadedOlderPages: boolean
    messagesVersion: number
}

function isSameMessage(a: OpenClawMessage, b: OpenClawMessage): boolean {
    return a.id === b.id
        && a.text === b.text
        && a.role === b.role
        && a.createdAt === b.createdAt
        && a.status === b.status
}

function createEmptyState(): OpenClawMessageWindowState {
    return {
        messages: [],
        hasMore: false,
        nextBeforeSeq: null,
        hasLoadedOlderPages: false,
        messagesVersion: 0
    }
}

export function mergeLatestOpenClawMessages(
    existing: OpenClawMessage[],
    incoming: OpenClawMessage[]
): { messages: OpenClawMessage[]; changed: boolean } {
    if (existing.length === 0) {
        return { messages: incoming, changed: incoming.length > 0 }
    }

    const nextMessages = existing.slice()
    const indexById = new Map(existing.map((message, index) => [message.id, index]))
    let changed = false

    for (const message of incoming) {
        const existingIndex = indexById.get(message.id)
        if (existingIndex === undefined) {
            nextMessages.push(message)
            indexById.set(message.id, nextMessages.length - 1)
            changed = true
            continue
        }

        if (!isSameMessage(nextMessages[existingIndex]!, message)) {
            nextMessages[existingIndex] = message
            changed = true
        }
    }

    return changed ? { messages: nextMessages, changed } : { messages: existing, changed }
}

export function mergeOlderOpenClawMessages(
    existing: OpenClawMessage[],
    incoming: OpenClawMessage[]
): { messages: OpenClawMessage[]; changed: boolean } {
    if (incoming.length === 0) {
        return { messages: existing, changed: false }
    }

    const indexById = new Map(existing.map((message, index) => [message.id, index]))
    const nextMessages = existing.slice()
    const olderMessagesToPrepend: OpenClawMessage[] = []
    let changed = false

    for (const message of incoming) {
        const existingIndex = indexById.get(message.id)
        if (existingIndex === undefined) {
            olderMessagesToPrepend.push(message)
            changed = true
            continue
        }

        if (!isSameMessage(nextMessages[existingIndex]!, message)) {
            nextMessages[existingIndex] = message
            changed = true
        }
    }

    if (olderMessagesToPrepend.length === 0) {
        return changed ? { messages: nextMessages, changed } : { messages: existing, changed }
    }

    return {
        messages: [...olderMessagesToPrepend, ...nextMessages],
        changed: true
    }
}

function applyLatestPage(
    prev: OpenClawMessageWindowState,
    page: OpenClawMessagesResponse
): OpenClawMessageWindowState {
    const merged = mergeLatestOpenClawMessages(prev.messages, page.messages)
    const nextBeforeSeq = prev.hasLoadedOlderPages ? prev.nextBeforeSeq : page.page.nextBeforeSeq
    const hasMore = prev.hasLoadedOlderPages ? prev.hasMore : page.page.hasMore
    const paginationChanged = nextBeforeSeq !== prev.nextBeforeSeq || hasMore !== prev.hasMore

    if (!merged.changed && !paginationChanged) {
        return prev
    }

    return {
        ...prev,
        messages: merged.messages,
        hasMore,
        nextBeforeSeq,
        messagesVersion: merged.changed ? prev.messagesVersion + 1 : prev.messagesVersion
    }
}

function applyOlderPage(
    prev: OpenClawMessageWindowState,
    page: OpenClawMessagesResponse
): OpenClawMessageWindowState {
    const merged = mergeOlderOpenClawMessages(prev.messages, page.messages)
    const paginationChanged = page.page.hasMore !== prev.hasMore || page.page.nextBeforeSeq !== prev.nextBeforeSeq || !prev.hasLoadedOlderPages

    if (!merged.changed && !paginationChanged) {
        return {
            ...prev,
            hasLoadedOlderPages: true
        }
    }

    return {
        ...prev,
        messages: merged.messages,
        hasMore: page.page.hasMore,
        nextBeforeSeq: page.page.nextBeforeSeq,
        hasLoadedOlderPages: true,
        messagesVersion: merged.changed ? prev.messagesVersion + 1 : prev.messagesVersion
    }
}

export function useOpenClawMessages(
    api: ApiClient | null,
    conversationId: string | null
): {
    messages: OpenClawMessage[]
    hasMore: boolean
    isLoading: boolean
    isLoadingMore: boolean
    messagesVersion: number
    error: string | null
    loadMore: () => Promise<unknown>
    refetch: () => Promise<unknown>
} {
    const [windowState, setWindowState] = useState<OpenClawMessageWindowState>(() => createEmptyState())
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const windowStateRef = useRef(windowState)

    useEffect(() => {
        const nextState = createEmptyState()
        windowStateRef.current = nextState
        setWindowState(nextState)
        setIsLoadingMore(false)
    }, [conversationId])

    const latestPageQuery = useQuery({
        queryKey: queryKeys.openclawMessages(conversationId ?? 'none'),
        queryFn: async () => {
            if (!api || !conversationId) {
                throw new Error('Conversation unavailable')
            }
            return await api.getOpenClawMessages(conversationId, { limit: OPENCLAW_MESSAGES_PAGE_SIZE })
        },
        enabled: Boolean(api && conversationId)
    })

    useEffect(() => {
        if (!latestPageQuery.data) {
            return
        }
        setWindowState((prev) => {
            const next = applyLatestPage(prev, latestPageQuery.data)
            windowStateRef.current = next
            return next
        })
    }, [latestPageQuery.data])

    const loadMore = useCallback(async () => {
        const currentState = windowStateRef.current
        if (!api || !conversationId || isLoadingMore || !currentState.hasMore || currentState.nextBeforeSeq === null) {
            return
        }

        setIsLoadingMore(true)
        try {
            let beforeSeq: number | null = currentState.nextBeforeSeq

            while (beforeSeq !== null) {
                const olderPage = await api.getOpenClawMessages(conversationId, {
                    beforeSeq,
                    limit: OPENCLAW_MESSAGES_PAGE_SIZE
                })

                const latestState = windowStateRef.current
                if (!latestState.hasLoadedOlderPages && latestState.nextBeforeSeq !== beforeSeq) {
                    if (!latestState.hasMore || latestState.nextBeforeSeq === null) {
                        break
                    }
                    beforeSeq = latestState.nextBeforeSeq
                    continue
                }

                setWindowState((prev) => {
                    const next = applyOlderPage(prev, olderPage)
                    windowStateRef.current = next
                    return next
                })
                break
            }
        } finally {
            setIsLoadingMore(false)
        }
    }, [api, conversationId, isLoadingMore])

    const refetch = useCallback(async () => {
        await latestPageQuery.refetch()
    }, [latestPageQuery])

    return useMemo(() => ({
        messages: windowState.messages,
        hasMore: windowState.hasMore,
        isLoading: latestPageQuery.isLoading,
        isLoadingMore,
        messagesVersion: windowState.messagesVersion,
        error: latestPageQuery.error instanceof Error
            ? latestPageQuery.error.message
            : latestPageQuery.error
                ? 'Failed to load OpenClaw messages'
                : null,
        loadMore,
        refetch
    }), [
        windowState.messages,
        windowState.hasMore,
        windowState.messagesVersion,
        latestPageQuery.isLoading,
        latestPageQuery.error,
        isLoadingMore,
        loadMore,
        refetch
    ])
}
