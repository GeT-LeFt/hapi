import { describe, expect, it } from 'vitest'
import { foldCompactionEvents, parseMessageAsEvent } from './reducerEvents'
import type { AgentEventBlock, ChatBlock, NormalizedMessage } from './types'

function makeAgentTextMessage(text: string): NormalizedMessage {
    return {
        role: 'agent',
        content: [{ type: 'text', text, uuid: 'u1', parentUUID: null }],
        id: 'msg-1',
        localId: null,
        createdAt: Date.now(),
        isSidechain: false,
    }
}

describe('parseMessageAsEvent — usage limit formats', () => {
    it('parses reached with limitType', () => {
        const msg = makeAgentTextMessage('Claude AI usage limit reached|1774278000|five_hour')
        expect(parseMessageAsEvent(msg)).toEqual({
            type: 'limit-reached',
            endsAt: 1774278000,
            limitType: 'five_hour',
        })
    })

    it('parses reached without limitType (backward compat)', () => {
        const msg = makeAgentTextMessage('Claude AI usage limit reached|1774278000')
        expect(parseMessageAsEvent(msg)).toEqual({
            type: 'limit-reached',
            endsAt: 1774278000,
            limitType: '',
        })
    })

    it('parses warning with five_hour type', () => {
        const msg = makeAgentTextMessage('Claude AI usage limit warning|1774278000|90|five_hour')
        expect(parseMessageAsEvent(msg)).toEqual({
            type: 'limit-warning',
            utilization: 0.9,
            endsAt: 1774278000,
            limitType: 'five_hour',
        })
    })

    it('parses warning with seven_day type', () => {
        const msg = makeAgentTextMessage('Claude AI usage limit warning|1774850400|85|seven_day')
        expect(parseMessageAsEvent(msg)).toEqual({
            type: 'limit-warning',
            utilization: 0.85,
            endsAt: 1774850400,
            limitType: 'seven_day',
        })
    })

    it('handles missing limitType', () => {
        const msg = makeAgentTextMessage('Claude AI usage limit warning|1774278000|100|')
        expect(parseMessageAsEvent(msg)).toEqual({
            type: 'limit-warning',
            utilization: 1,
            endsAt: 1774278000,
            limitType: '',
        })
    })

    it('returns null for non-limit text', () => {
        const msg = makeAgentTextMessage('Hello world')
        expect(parseMessageAsEvent(msg)).toBeNull()
    })

    it('returns null for sidechain messages', () => {
        const msg = makeAgentTextMessage('Claude AI usage limit reached|1774278000')
        msg.isSidechain = true
        expect(parseMessageAsEvent(msg)).toBeNull()
    })
})

function makeEventBlock(event: AgentEventBlock['event'], id = 'e1'): AgentEventBlock {
    return { kind: 'agent-event', id, createdAt: Date.now(), event }
}

function makeTextBlock(id = 't1'): ChatBlock {
    return { kind: 'agent-text', id, localId: null, createdAt: Date.now(), text: 'hello', meta: undefined }
}

const longSummary = 'A'.repeat(250)

describe('foldCompactionEvents', () => {
    it('folds [started, completed, summary] into [summary]', () => {
        const blocks: ChatBlock[] = [
            makeEventBlock({ type: 'message', message: 'Compaction started' }, 'e1'),
            makeEventBlock({ type: 'message', message: 'Compaction completed' }, 'e2'),
            makeEventBlock({ type: 'message', message: longSummary }, 'e3'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(1)
        expect((result[0] as AgentEventBlock).id).toBe('e3')
    })

    it('folds [compact_boundary, summary] into [summary]', () => {
        const blocks: ChatBlock[] = [
            makeEventBlock({ type: 'compact', trigger: 'auto', preTokens: 100000 }, 'e1'),
            makeEventBlock({ type: 'message', message: longSummary }, 'e2'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(1)
        expect((result[0] as AgentEventBlock).id).toBe('e2')
    })

    it('folds [microcompact_boundary, summary] into [summary]', () => {
        const blocks: ChatBlock[] = [
            makeEventBlock({ type: 'microcompact', trigger: 'auto', preTokens: 80000, tokensSaved: 20000 }, 'e1'),
            makeEventBlock({ type: 'message', message: longSummary }, 'e2'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(1)
        expect((result[0] as AgentEventBlock).id).toBe('e2')
    })

    it('keeps standalone compaction started when no summary follows', () => {
        const blocks: ChatBlock[] = [
            makeEventBlock({ type: 'message', message: 'Compaction started' }, 'e1'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(1)
        expect((result[0] as AgentEventBlock).id).toBe('e1')
    })

    it('breaks fold when non-compaction block is in between', () => {
        const blocks: ChatBlock[] = [
            makeEventBlock({ type: 'message', message: 'Compaction started' }, 'e1'),
            makeTextBlock('t1'),
            makeEventBlock({ type: 'message', message: longSummary }, 'e2'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(3)
    })

    it('handles two separate compaction groups', () => {
        const blocks: ChatBlock[] = [
            makeEventBlock({ type: 'message', message: 'Compaction started' }, 'e1'),
            makeEventBlock({ type: 'message', message: 'Compaction completed' }, 'e2'),
            makeEventBlock({ type: 'message', message: longSummary }, 'e3'),
            makeTextBlock('t1'),
            makeEventBlock({ type: 'message', message: 'Compaction started' }, 'e4'),
            makeEventBlock({ type: 'message', message: 'Compaction completed' }, 'e5'),
            makeEventBlock({ type: 'message', message: longSummary + 'B' }, 'e6'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(3)
        expect((result[0] as AgentEventBlock).id).toBe('e3')
        expect(result[1].kind).toBe('agent-text')
        expect((result[2] as AgentEventBlock).id).toBe('e6')
    })

    it('passes through non-compaction events untouched', () => {
        const blocks: ChatBlock[] = [
            makeTextBlock('t1'),
            makeEventBlock({ type: 'title-changed', title: 'hello' }, 'e1'),
            makeTextBlock('t2'),
        ]
        const result = foldCompactionEvents(blocks)
        expect(result).toHaveLength(3)
    })
})
