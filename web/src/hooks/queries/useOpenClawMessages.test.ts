import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenClawMessage } from '@hapi/protocol/types'
import type { ApiClient } from '@/api/client'
import { mergeLatestOpenClawMessages, mergeOlderOpenClawMessages, useOpenClawMessages } from './useOpenClawMessages'

function makeMessage(seq: number, overrides: Partial<OpenClawMessage> = {}): OpenClawMessage {
    return {
        id: `msg-${seq}`,
        conversationId: 'conv-1',
        role: 'assistant',
        text: `message ${seq}`,
        createdAt: seq,
        status: 'completed',
        ...overrides
    }
}

function makePage(start: number, end: number, page: {
    nextBeforeSeq: number | null
    hasMore: boolean
}): {
    messages: OpenClawMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
} {
    return {
        messages: Array.from({ length: end - start + 1 }, (_, index) => makeMessage(start + index)),
        page: {
            limit: 50,
            beforeSeq: null,
            nextBeforeSeq: page.nextBeforeSeq,
            hasMore: page.hasMore
        }
    }
}

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            }
        }
    })

    return function Wrapper(props: { children: ReactNode }) {
        return createElement(QueryClientProvider, { client: queryClient }, props.children)
    }
}

function createDeferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
        resolve = res
    })
    return { promise, resolve }
}

describe('mergeLatestOpenClawMessages', () => {
    it('keeps previously loaded boundary messages when the newest page shifts forward', () => {
        const existing = [
            makeMessage(1),
            makeMessage(2),
            makeMessage(3),
            makeMessage(4),
            makeMessage(5)
        ]
        const incoming = [
            makeMessage(2),
            makeMessage(3),
            makeMessage(4),
            makeMessage(5),
            makeMessage(6)
        ]

        const merged = mergeLatestOpenClawMessages(existing, incoming)

        expect(merged.messages.map((message) => message.id)).toEqual([
            'msg-1',
            'msg-2',
            'msg-3',
            'msg-4',
            'msg-5',
            'msg-6'
        ])
    })

    it('updates streamed message content in place instead of appending duplicates', () => {
        const existing = [
            makeMessage(10),
            makeMessage(11, { text: 'partial', status: 'streaming' })
        ]
        const incoming = [
            makeMessage(10),
            makeMessage(11, { text: 'partial + done', status: 'completed' }),
            makeMessage(12)
        ]

        const merged = mergeLatestOpenClawMessages(existing, incoming)

        expect(merged.messages).toEqual([
            makeMessage(10),
            makeMessage(11, { text: 'partial + done', status: 'completed' }),
            makeMessage(12)
        ])
    })
})

describe('mergeOlderOpenClawMessages', () => {
    it('prepends newly loaded older history without disturbing the current window', () => {
        const existing = [
            makeMessage(4),
            makeMessage(5),
            makeMessage(6)
        ]
        const incoming = [
            makeMessage(1),
            makeMessage(2),
            makeMessage(3)
        ]

        const merged = mergeOlderOpenClawMessages(existing, incoming)

        expect(merged.messages.map((message) => message.id)).toEqual([
            'msg-1',
            'msg-2',
            'msg-3',
            'msg-4',
            'msg-5',
            'msg-6'
        ])
    })
})

describe('useOpenClawMessages', () => {
    it('retries loadMore with the latest cursor when the newest page shifts during an in-flight older-page request', async () => {
        const olderPageDeferred = createDeferred<ReturnType<typeof makePage>>()
        const latestPages = [
            makePage(51, 100, { nextBeforeSeq: 51, hasMore: true }),
            makePage(52, 101, { nextBeforeSeq: 52, hasMore: true })
        ]
        const api = {
            getOpenClawMessages: vi.fn(async (_conversationId: string, options?: { beforeSeq?: number | null; limit?: number }) => {
                if (options?.beforeSeq === undefined || options.beforeSeq === null) {
                    return latestPages.shift()!
                }
                if (options.beforeSeq === 51) {
                    return await olderPageDeferred.promise
                }
                if (options.beforeSeq === 52) {
                    return makePage(2, 51, { nextBeforeSeq: 2, hasMore: true })
                }
                throw new Error(`Unexpected beforeSeq: ${options.beforeSeq}`)
            })
        } as Pick<ApiClient, 'getOpenClawMessages'> as ApiClient

        const { result } = renderHook(
            () => useOpenClawMessages(api, 'conv-1'),
            { wrapper: createWrapper() }
        )

        await waitFor(() => {
            expect(result.current.messages[0]?.id).toBe('msg-51')
        })

        let loadMorePromise: Promise<unknown> | undefined
        act(() => {
            loadMorePromise = result.current.loadMore() as Promise<unknown>
        })

        await act(async () => {
            await result.current.refetch()
        })

        await waitFor(() => {
            expect(result.current.messages.at(-1)?.id).toBe('msg-101')
        })

        olderPageDeferred.resolve(makePage(1, 50, { nextBeforeSeq: 1, hasMore: false }))

        await act(async () => {
            await loadMorePromise
        })

        await waitFor(() => {
            expect(api.getOpenClawMessages).toHaveBeenCalledWith('conv-1', expect.objectContaining({ beforeSeq: 52 }))
        })

        expect(result.current.messages[0]?.id).toBe('msg-2')
        expect(result.current.messages[49]?.id).toBe('msg-51')
        expect(result.current.messages[50]?.id).toBe('msg-52')
        expect(result.current.messages.at(-1)?.id).toBe('msg-101')
        expect(result.current.hasMore).toBe(true)
    })
})
