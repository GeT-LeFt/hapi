import { randomUUID } from 'node:crypto'
import { Hono, type Context } from 'hono'
import type { HapiCallbackEvent, PluginCommandAck } from './types'
import { MockOpenClawRuntime } from './openclawRuntime'
import { HapiCallbackClient } from './hapiClient'

type RouteDeps = {
    sharedSecret: string
    namespace: string
    callbackClient: HapiCallbackClient
    runtime: MockOpenClawRuntime
    idempotencyCache: Map<string, PluginCommandAck>
}

function isAuthorized(req: Request, sharedSecret: string): boolean {
    const header = req.headers.get('authorization')?.trim()
    return header === `Bearer ${sharedSecret}`
}

async function dispatchEvents(callbackClient: HapiCallbackClient, events: HapiCallbackEvent[]): Promise<void> {
    for (const event of events) {
        await callbackClient.postEvent(event)
    }
}

export function createPluginApp(deps: RouteDeps): Hono {
    const app = new Hono()

    const healthHandler = (c: Context) => {
        return c.json({
            ok: true,
            pluginVersion: '0.1.0',
            openclawConnected: true
        })
    }

    const authMiddleware = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
        if (!isAuthorized(c.req.raw, deps.sharedSecret)) {
            return c.json({ error: 'Unauthorized' }, 401)
        }
        return await next()
    }

    app.get('/hapi/health', healthHandler)

    app.use('/hapi/channel/*', authMiddleware)

    const ensureDefaultConversationHandler = async (c: Context) => {
        const body = await c.req.json().catch(() => null) as { externalUserKey?: string } | null
        if (!body?.externalUserKey) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        return c.json(deps.runtime.ensureDefaultConversation(body.externalUserKey))
    }

    const sendMessageHandler = async (c: Context) => {
        const idempotencyKey = c.req.header('idempotency-key')
        if (!idempotencyKey) {
            return c.json({ error: 'Missing idempotency-key' }, 400)
        }

        const cached = deps.idempotencyCache.get(idempotencyKey)
        if (cached) {
            return c.json(cached)
        }

        const body = await c.req.json().catch(() => null) as {
            conversationId?: string
            text?: string
            localMessageId?: string
        } | null
        if (!body?.conversationId || typeof body.text !== 'string' || !body.localMessageId) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const ack: PluginCommandAck = {
            accepted: true,
            upstreamRequestId: `plugin-send:${randomUUID()}`,
            upstreamConversationId: body.conversationId,
            retryAfterMs: null
        }
        deps.idempotencyCache.set(idempotencyKey, ack)

        queueMicrotask(() => {
            void dispatchEvents(deps.callbackClient, deps.runtime.run({
                kind: 'send-message',
                conversationId: body.conversationId!,
                text: body.text!,
                localMessageId: body.localMessageId!
            }))
        })

        return c.json(ack)
    }

    const approveHandler = async (c: Context) => {
        const idempotencyKey = c.req.header('idempotency-key')
        if (!idempotencyKey) {
            return c.json({ error: 'Missing idempotency-key' }, 400)
        }

        const cached = deps.idempotencyCache.get(idempotencyKey)
        if (cached) {
            return c.json(cached)
        }

        const body = await c.req.json().catch(() => null) as { conversationId?: string } | null
        if (!body?.conversationId) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const ack: PluginCommandAck = {
            accepted: true,
            upstreamRequestId: `plugin-approve:${randomUUID()}`,
            upstreamConversationId: body.conversationId,
            retryAfterMs: null
        }
        deps.idempotencyCache.set(idempotencyKey, ack)

        queueMicrotask(() => {
            void dispatchEvents(deps.callbackClient, deps.runtime.run({
                kind: 'approve',
                conversationId: body.conversationId!,
                requestId: c.req.param('requestId')
            }))
        })

        return c.json(ack)
    }

    const denyHandler = async (c: Context) => {
        const idempotencyKey = c.req.header('idempotency-key')
        if (!idempotencyKey) {
            return c.json({ error: 'Missing idempotency-key' }, 400)
        }

        const cached = deps.idempotencyCache.get(idempotencyKey)
        if (cached) {
            return c.json(cached)
        }

        const body = await c.req.json().catch(() => null) as { conversationId?: string } | null
        if (!body?.conversationId) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const ack: PluginCommandAck = {
            accepted: true,
            upstreamRequestId: `plugin-deny:${randomUUID()}`,
            upstreamConversationId: body.conversationId,
            retryAfterMs: null
        }
        deps.idempotencyCache.set(idempotencyKey, ack)

        queueMicrotask(() => {
            void dispatchEvents(deps.callbackClient, deps.runtime.run({
                kind: 'deny',
                conversationId: body.conversationId!,
                requestId: c.req.param('requestId')
            }))
        })

        return c.json(ack)
    }

    app.post('/hapi/channel/conversations/default', ensureDefaultConversationHandler)

    app.post('/hapi/channel/messages', sendMessageHandler)

    app.post('/hapi/channel/approvals/:requestId/approve', approveHandler)

    app.post('/hapi/channel/approvals/:requestId/deny', denyHandler)

    return app
}
