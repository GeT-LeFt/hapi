import { beforeEach, describe, expect, it } from 'bun:test'
import type { HapiCallbackEvent } from './types'
import { HapiCallbackClient } from './hapiClient'
import { createTranscriptUpdateDispatcher, handleTranscriptUpdate } from './transcriptBridge'
import { adapterState } from './adapterState'

class CapturingCallbackClient extends HapiCallbackClient {
    events: HapiCallbackEvent[] = []

    constructor() {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(event: HapiCallbackEvent): Promise<void> {
        this.events.push(event)
    }
}

class RetryableCallbackClient extends HapiCallbackClient {
    attempts = 0
    events: HapiCallbackEvent[] = []

    constructor(private readonly failuresBeforeSuccess: number) {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(event: HapiCallbackEvent): Promise<void> {
        this.attempts += 1
        if (this.attempts <= this.failuresBeforeSuccess) {
            throw new Error(`retryable failure ${this.attempts}`)
        }
        this.events.push(event)
    }
}

function createLogger() {
    return {
        warnMessages: [] as string[],
        errorMessages: [] as string[],
        warn(message: string) {
            this.warnMessages.push(message)
        },
        error(message: string) {
            this.errorMessages.push(message)
        }
    }
}

async function flushTimers(turns: number = 1): Promise<void> {
    for (let index = 0; index < turns; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

describe('handleTranscriptUpdate', () => {
    beforeEach(() => {
        adapterState.resetForTests()
    })

    it('forwards repeated transcript updates for the same assistant message id', async () => {
        const callbackClient = new CapturingCallbackClient()
        const update = {
            sessionKey: 'agent:main:hapi-openclaw:default:debug-user',
            messageId: 'assistant-1',
            message: {
                role: 'assistant',
                content: 'partial',
                timestamp: 100
            }
        }

        await handleTranscriptUpdate(callbackClient, update)
        await handleTranscriptUpdate(callbackClient, {
            ...update,
            message: {
                ...update.message,
                content: 'partial and more'
            }
        })

        expect(callbackClient.events).toHaveLength(2)
        expect(callbackClient.events[0]?.type).toBe('message')
        expect(callbackClient.events[1]?.type).toBe('message')
        expect(callbackClient.events[0]?.eventId).not.toBe(callbackClient.events[1]?.eventId)
    })

    it('does not end the active run when transcript text arrives', async () => {
        const callbackClient = new CapturingCallbackClient()
        const conversationId = 'agent:main:hapi-openclaw:default:debug-user'

        expect(adapterState.startRun(conversationId)).toBe(true)

        await handleTranscriptUpdate(callbackClient, {
            sessionKey: conversationId,
            messageId: 'assistant-1',
            message: {
                role: 'assistant',
                content: 'partial',
                timestamp: 100
            }
        })

        expect(adapterState.isRunActive(conversationId)).toBe(true)
        expect(callbackClient.events).toHaveLength(1)
        expect(callbackClient.events[0]?.type).toBe('message')
    })

    it('retries transcript callbacks after a transient delivery failure', async () => {
        const callbackClient = new RetryableCallbackClient(1)
        const logger = createLogger()
        const dispatcher = createTranscriptUpdateDispatcher({
            callbackClient,
            logger,
            retryBaseDelayMs: 0
        })

        dispatcher.enqueue({
            sessionKey: 'agent:main:hapi-openclaw:default:debug-user',
            messageId: 'assistant-1',
            message: {
                role: 'assistant',
                content: 'partial',
                timestamp: 100
            }
        })

        await flushTimers(3)

        expect(callbackClient.attempts).toBe(2)
        expect(callbackClient.events).toHaveLength(1)
        expect(callbackClient.events[0]?.type).toBe('message')
        expect(logger.warnMessages).toHaveLength(1)

        dispatcher.stop()
    })

    it('coalesces newer transcript snapshots while retrying the same assistant message', async () => {
        const callbackClient = new RetryableCallbackClient(1)
        const logger = createLogger()
        const dispatcher = createTranscriptUpdateDispatcher({
            callbackClient,
            logger,
            retryBaseDelayMs: 0
        })

        dispatcher.enqueue({
            sessionKey: 'agent:main:hapi-openclaw:default:debug-user',
            messageId: 'assistant-1',
            message: {
                role: 'assistant',
                content: 'partial',
                timestamp: 100
            }
        })
        dispatcher.enqueue({
            sessionKey: 'agent:main:hapi-openclaw:default:debug-user',
            messageId: 'assistant-1',
            message: {
                role: 'assistant',
                content: 'partial and more',
                timestamp: 100
            }
        })

        await flushTimers(3)

        expect(callbackClient.events).toHaveLength(1)
        expect(callbackClient.events[0]?.type).toBe('message')
        const messageEvent = callbackClient.events[0]
        expect(messageEvent?.type).toBe('message')
        expect(messageEvent && messageEvent.type === 'message' ? messageEvent.content : null).toEqual({
            mode: 'replace',
            text: 'partial and more'
        })

        dispatcher.stop()
    })
})
