import type { OpenClawMessage } from '@hapi/protocol/types'
import type { ChatBlock } from '@/chat/types'

export function openClawMessagesToChatBlocks(messages: OpenClawMessage[]): ChatBlock[] {
    return messages.map((message) => {
        if (message.role === 'user') {
            return {
                kind: 'user-text',
                id: message.id,
                localId: null,
                createdAt: message.createdAt,
                text: message.text,
            } satisfies ChatBlock
        }

        return {
            kind: 'agent-text',
            id: message.id,
            localId: null,
            createdAt: message.createdAt,
            text: message.text,
            meta: {
                openclawRole: message.role,
                openclawStatus: message.status ?? null
            }
        } satisfies ChatBlock
    })
}
