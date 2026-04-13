import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { OpenClawChatService } from '../../openclaw/types'
import { Store } from '../../store'
import { createOpenClawIngressRoutes } from './openclawIngress'

function sign(timestamp: number, rawBody: string, secret: string): string {
    return createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex')
}

function createService(events: unknown[]): OpenClawChatService {
    return {
        async getOrCreateDefaultConversation() {
            throw new Error('not used')
        },
        async verifyConversationAccess() {
            throw new Error('not used')
        },
        async listMessages() {
            throw new Error('not used')
        },
        async getState() {
            throw new Error('not used')
        },
        async sendMessage() {
            throw new Error('not used')
        },
        async approve() {
            throw new Error('not used')
        },
        async deny() {
            throw new Error('not used')
        },
        async ingestInboundEvent(event) {
            events.push(event)
        }
    }
}

function createApp(store: Store, events: unknown[], service?: OpenClawChatService) {
    const app = new Hono()
    app.route('/api', createOpenClawIngressRoutes(() => service ?? createService(events), () => store))
    return app
}

afterEach(() => {
    delete process.env.OPENCLAW_SHARED_SECRET
})

describe('openclaw ingress routes', () => {
    it('verifies signatures and ignores duplicate processed receipts', async () => {
        process.env.OPENCLAW_SHARED_SECRET = 'test-secret'

        const store = new Store(':memory:')
        store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'upstream-conv-1',
            title: 'OpenClaw'
        })

        const events: unknown[] = []
        const app = createApp(store, events)
        const timestamp = Date.now()
        const rawBody = JSON.stringify({
            type: 'message',
            eventId: 'evt-1',
            occurredAt: timestamp,
            conversationId: 'upstream-conv-1',
            externalMessageId: 'ext-1',
            text: 'hello',
            status: 'completed'
        })

        const response = await app.request('/api/openclaw/channel/events', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-openclaw-timestamp': `${timestamp}`,
                'x-openclaw-signature': sign(timestamp, rawBody, 'test-secret')
            },
            body: rawBody
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(events).toHaveLength(1)
        expect(store.openclawReceipts.hasProcessedReceipt('default', 'evt-1')).toBe(true)

        const duplicate = await app.request('/api/openclaw/channel/events', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-openclaw-timestamp': `${timestamp}`,
                'x-openclaw-signature': sign(timestamp, rawBody, 'test-secret')
            },
            body: rawBody
        })

        expect(duplicate.status).toBe(200)
        expect(await duplicate.json()).toEqual({ ok: true, duplicate: true })
        expect(events).toHaveLength(1)
    })

    it('rejects invalid signatures', async () => {
        process.env.OPENCLAW_SHARED_SECRET = 'test-secret'

        const store = new Store(':memory:')
        store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'upstream-conv-1',
            title: 'OpenClaw'
        })

        const app = createApp(store, [])
        const timestamp = Date.now()
        const rawBody = JSON.stringify({
            type: 'state',
            eventId: 'evt-state-1',
            occurredAt: timestamp,
            conversationId: 'upstream-conv-1',
            connected: true,
            thinking: false
        })

        const response = await app.request('/api/openclaw/channel/events', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-openclaw-timestamp': `${timestamp}`,
                'x-openclaw-signature': 'bad-signature'
            },
            body: rawBody
        })

        expect(response.status).toBe(401)
        expect(store.openclawReceipts.getReceipt('default', 'evt-state-1')).toBeNull()
    })

    it('ignores in-flight duplicate deliveries before the first receipt is processed', async () => {
        process.env.OPENCLAW_SHARED_SECRET = 'test-secret'

        const store = new Store(':memory:')
        store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'upstream-conv-1',
            title: 'OpenClaw'
        })

        const events: unknown[] = []
        let releaseIngest: () => void = () => {}
        const ingestStarted = new Promise<void>((resolve) => {
            releaseIngest = resolve
        })
        const service: OpenClawChatService = {
            ...createService(events),
            async ingestInboundEvent(event) {
                events.push(event)
                await ingestStarted
            }
        }
        const app = createApp(store, events, service)
        const timestamp = Date.now()
        const rawBody = JSON.stringify({
            type: 'message',
            eventId: 'evt-race-1',
            occurredAt: timestamp,
            conversationId: 'upstream-conv-1',
            externalMessageId: 'ext-1',
            content: {
                mode: 'append',
                delta: 'hello'
            },
            status: 'streaming'
        })
        const requestInit = {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-openclaw-timestamp': `${timestamp}`,
                'x-openclaw-signature': sign(timestamp, rawBody, 'test-secret')
            },
            body: rawBody
        } satisfies RequestInit

        const firstRequest = app.request('/api/openclaw/channel/events', requestInit)
        await Promise.resolve()

        const duplicate = await app.request('/api/openclaw/channel/events', requestInit)

        expect(duplicate.status).toBe(200)
        expect(await duplicate.json()).toEqual({ ok: true, duplicate: true })
        expect(events).toHaveLength(1)
        expect(store.openclawReceipts.hasProcessedReceipt('default', 'evt-race-1')).toBe(false)

        releaseIngest()
        const firstResponse = await firstRequest
        expect(firstResponse.status).toBe(200)
        expect(await firstResponse.json()).toEqual({ ok: true })
        expect(store.openclawReceipts.hasProcessedReceipt('default', 'evt-race-1')).toBe(true)
    })

    it('releases a claimed receipt when ingest fails so retries can reprocess', async () => {
        process.env.OPENCLAW_SHARED_SECRET = 'test-secret'

        const store = new Store(':memory:')
        store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'upstream-conv-1',
            title: 'OpenClaw'
        })

        const events: unknown[] = []
        let shouldFail = true
        const service: OpenClawChatService = {
            ...createService(events),
            async ingestInboundEvent(event) {
                if (shouldFail) {
                    throw new Error('boom')
                }
                events.push(event)
            }
        }
        const app = createApp(store, events, service)
        const timestamp = Date.now()
        const rawBody = JSON.stringify({
            type: 'message',
            eventId: 'evt-retry-1',
            occurredAt: timestamp,
            conversationId: 'upstream-conv-1',
            externalMessageId: 'ext-1',
            text: 'hello',
            status: 'completed'
        })
        const requestInit = {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-openclaw-timestamp': `${timestamp}`,
                'x-openclaw-signature': sign(timestamp, rawBody, 'test-secret')
            },
            body: rawBody
        } satisfies RequestInit

        const failed = await app.request('/api/openclaw/channel/events', requestInit)
        expect(failed.status).toBe(500)
        expect(store.openclawReceipts.getReceipt('default', 'evt-retry-1')).toBeNull()

        shouldFail = false
        const retried = await app.request('/api/openclaw/channel/events', requestInit)
        expect(retried.status).toBe(200)
        expect(await retried.json()).toEqual({ ok: true })
        expect(events).toHaveLength(1)
        expect(store.openclawReceipts.hasProcessedReceipt('default', 'evt-retry-1')).toBe(true)
    })

    it('fails clearly when the shared secret is not configured', async () => {
        const store = new Store(':memory:')
        const app = createApp(store, [])

        const response = await app.request('/api/openclaw/channel/events', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                type: 'state',
                eventId: 'evt-state-1',
                occurredAt: Date.now(),
                conversationId: 'upstream-conv-1',
                connected: true,
                thinking: false
            })
        })

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'OpenClaw shared secret not configured' })
    })
})
