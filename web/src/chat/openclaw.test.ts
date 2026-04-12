import { describe, expect, it } from 'vitest'
import { openClawMessagesToChatBlocks } from './openclaw'

describe('openClawMessagesToChatBlocks', () => {
    it('maps user messages to user bubbles and non-user messages to assistant bubbles', () => {
        const blocks = openClawMessagesToChatBlocks([
            {
                id: 'user-1',
                conversationId: 'conv-1',
                role: 'user',
                text: 'hello',
                createdAt: 10,
                status: 'completed'
            },
            {
                id: 'assistant-1',
                conversationId: 'conv-1',
                role: 'assistant',
                text: 'world',
                createdAt: 20,
                status: 'streaming'
            },
            {
                id: 'system-1',
                conversationId: 'conv-1',
                role: 'system',
                text: 'note',
                createdAt: 30,
                status: 'completed'
            }
        ])

        expect(blocks).toEqual([
            {
                kind: 'user-text',
                id: 'user-1',
                localId: null,
                createdAt: 10,
                text: 'hello'
            },
            {
                kind: 'agent-text',
                id: 'assistant-1',
                localId: null,
                createdAt: 20,
                text: 'world',
                meta: {
                    openclawRole: 'assistant',
                    openclawStatus: 'streaming'
                }
            },
            {
                kind: 'agent-text',
                id: 'system-1',
                localId: null,
                createdAt: 30,
                text: 'note',
                meta: {
                    openclawRole: 'system',
                    openclawStatus: 'completed'
                }
            }
        ])
    })
})
