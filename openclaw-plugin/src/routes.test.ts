import { describe, expect, it } from 'bun:test'
import { createPluginApp } from './routes'
import { HapiCallbackClient } from './hapiClient'
import { MockOpenClawRuntime } from './openclawRuntime'

class StubCallbackClient extends HapiCallbackClient {
    events: unknown[] = []

    constructor() {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(event: unknown): Promise<void> {
        this.events.push(event)
    }
}

function createApp() {
    const callbackClient = new StubCallbackClient()
    const app = createPluginApp({
        sharedSecret: 'plugin-secret',
        namespace: 'default',
        callbackClient,
        runtime: new MockOpenClawRuntime('default'),
        idempotencyCache: new Map()
    })
    return { app, callbackClient }
}

describe('openclaw plugin routes', () => {
    it('rejects unauthorized command requests', async () => {
        const { app } = createApp()
        const response = await app.request('/hapi/channel/messages', { method: 'POST' })
        expect(response.status).toBe(401)
    })

    it('does not expose the legacy non-/hapi routes', async () => {
        const { app } = createApp()
        const response = await app.request('/channel/messages', { method: 'POST' })
        expect(response.status).toBe(404)
    })

    it('returns idempotent acknowledgements for repeated send-message calls', async () => {
        const { app, callbackClient } = createApp()
        const init = {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1',
                text: 'hello',
                localMessageId: 'msg-1'
            })
        }

        const first = await app.request('/hapi/channel/messages', init)
        const firstJson = await first.json() as { upstreamRequestId: string }
        const second = await app.request('/hapi/channel/messages', init)
        const secondJson = await second.json() as { upstreamRequestId: string }

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(secondJson.upstreamRequestId).toBe(firstJson.upstreamRequestId)

        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(callbackClient.events.length).toBeGreaterThan(0)
    })

    it('creates approval-request events when message text contains approval', async () => {
        const { app, callbackClient } = createApp()
        await app.request('/hapi/channel/messages', {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-approval-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1',
                text: 'please ask for approval',
                localMessageId: 'msg-1'
            })
        })

        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(callbackClient.events.some((event) => {
            return typeof event === 'object'
                && event !== null
                && 'type' in event
                && event.type === 'approval-request'
        })).toBe(true)
    })
})
