import { describe, expect, it } from 'vitest'
import type {
    OpenClawApprovalRequest,
    OpenClawMessage,
    OpenClawState
} from '@hapi/protocol/types'
import type {
    OpenClawMessagesResponse,
    OpenClawStateResponse
} from '@/types/api'
import {
    applyOpenClawApprovalRequestEvent,
    applyOpenClawApprovalResolvedEvent,
    applyOpenClawMessageEvent,
    applyOpenClawStateEvent
} from './openclawSseCache'

function makeMessage(id: string, overrides: Partial<OpenClawMessage> = {}): OpenClawMessage {
    return {
        id,
        conversationId: 'conv-1',
        role: 'assistant',
        text: `message ${id}`,
        createdAt: 1,
        status: 'streaming',
        ...overrides
    }
}

function makeMessagesResponse(messages: OpenClawMessage[]): OpenClawMessagesResponse {
    return {
        messages,
        page: {
            limit: 50,
            beforeSeq: null,
            nextBeforeSeq: null,
            hasMore: false
        }
    }
}

function makeApproval(id: string): OpenClawApprovalRequest {
    return {
        id,
        conversationId: 'conv-1',
        title: `Approval ${id}`,
        status: 'pending',
        createdAt: 1
    }
}

function makeState(overrides: Partial<OpenClawState> = {}): OpenClawState {
    return {
        conversationId: 'conv-1',
        connected: true,
        thinking: false,
        lastError: null,
        pendingApprovals: [],
        ...overrides
    }
}

describe('applyOpenClawMessageEvent', () => {
    it('upserts messages without invalidating the query', () => {
        const previous = makeMessagesResponse([makeMessage('msg-1', { text: 'partial' })])

        const next = applyOpenClawMessageEvent(previous, makeMessage('msg-1', {
            text: 'partial and more',
            status: 'completed'
        }))

        expect(next.messages).toHaveLength(1)
        expect(next.messages[0]?.text).toBe('partial and more')
        expect(next.messages[0]?.status).toBe('completed')
    })

    it('creates a minimal cache payload when the query has not loaded yet', () => {
        const next = applyOpenClawMessageEvent(undefined, makeMessage('msg-1'))

        expect(next.messages).toHaveLength(1)
        expect(next.page.limit).toBe(50)
    })
})

describe('applyOpenClawStateEvent', () => {
    it('replaces the cached state with the SSE payload', () => {
        const state = makeState({ thinking: true })

        expect(applyOpenClawStateEvent(undefined, state)).toEqual({ state })
    })
})

describe('approval state patch helpers', () => {
    it('adds pending approvals directly into cached state', () => {
        const previous: OpenClawStateResponse = {
            state: makeState()
        }

        const next = applyOpenClawApprovalRequestEvent(previous, makeApproval('req-1'))

        expect(next?.state.pendingApprovals).toHaveLength(1)
        expect(next?.state.pendingApprovals?.[0]?.id).toBe('req-1')
    })

    it('removes resolved approvals from cached state', () => {
        const previous: OpenClawStateResponse = {
            state: makeState({
                pendingApprovals: [makeApproval('req-1'), makeApproval('req-2')]
            })
        }

        const next = applyOpenClawApprovalResolvedEvent(previous, 'req-1', 'approved')

        expect(next?.state.pendingApprovals).toHaveLength(1)
        expect(next?.state.pendingApprovals?.[0]?.id).toBe('req-2')
    })
})
