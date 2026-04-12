export type PluginCommandAck = {
    accepted: boolean
    upstreamRequestId: string
    upstreamConversationId: string
    retryAfterMs: number | null
}

export type PluginConfig = {
    listenHost: string
    listenPort: number
    sharedSecret: string
    hapiBaseUrl: string
    namespace: string
}

export type HapiCallbackEvent =
    | {
        type: 'message'
        eventId: string
        occurredAt: number
        namespace: string
        conversationId: string
        externalMessageId: string
        role: 'user' | 'assistant' | 'system'
        content: { mode: 'replace'; text: string } | { mode: 'append'; delta: string }
        createdAt?: number
        status?: 'streaming' | 'completed' | 'failed'
    }
    | {
        type: 'approval-request'
        eventId: string
        occurredAt: number
        namespace: string
        conversationId: string
        requestId: string
        title: string
        description?: string
        createdAt?: number
    }
    | {
        type: 'approval-resolved'
        eventId: string
        occurredAt: number
        namespace: string
        conversationId: string
        requestId: string
        status: 'approved' | 'denied'
    }
    | {
        type: 'state'
        eventId: string
        occurredAt: number
        namespace: string
        conversationId: string
        connected: boolean
        thinking: boolean
        lastError?: string | null
    }

export type PluginRuntimeAction =
    | {
        kind: 'send-message'
        conversationId: string
        text: string
        localMessageId: string
    }
    | {
        kind: 'approve'
        conversationId: string
        requestId: string
    }
    | {
        kind: 'deny'
        conversationId: string
        requestId: string
    }
