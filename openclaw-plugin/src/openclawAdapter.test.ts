import { beforeEach, describe, expect, it } from 'bun:test'
import type { PluginRuntime } from 'openclaw/plugin-sdk/runtime-store'
import { adapterState } from './adapterState'
import { HapiCallbackClient } from './hapiClient'
import { RealOpenClawAdapter } from './openclawAdapter'
import { buildHapiSessionKey } from './sessionKeys'

const stubLogger = {
    info() {},
    warn() {},
    error() {}
}

class ThrowingCallbackClient extends HapiCallbackClient {
    attempts = 0

    constructor(private readonly error: Error) {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(): Promise<void> {
        this.attempts += 1
        throw this.error
    }
}

class SequencedCallbackClient extends HapiCallbackClient {
    attempts = 0
    events: unknown[] = []

    constructor(private readonly failures: boolean[]) {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(event: unknown): Promise<void> {
        this.attempts += 1
        this.events.push(event)
        if (this.failures[this.attempts - 1]) {
            throw new Error(`callback unavailable ${this.attempts}`)
        }
    }
}

function createRuntime(options: {
    runEmbeddedPiAgent?: () => Promise<{ meta: { error?: { message?: string | null } | null; finalAssistantVisibleText?: string | null } }>
    saveSessionStore?: () => Promise<void>
} = {}): PluginRuntime {
    return {
        config: {
            loadConfig() {
                return {}
            }
        },
        agent: {
            ensureAgentWorkspace: async () => ({ dir: '/tmp/workspace' }),
            resolveAgentWorkspaceDir: () => '/tmp/workspace',
            resolveAgentDir: () => '/tmp/agent',
            resolveAgentTimeoutMs: () => 1000,
            runEmbeddedPiAgent: options.runEmbeddedPiAgent ?? (async () => ({
                meta: {
                    error: null,
                    finalAssistantVisibleText: null
                }
            })),
            session: {
                resolveStorePath: () => '/tmp/session-store.json',
                loadSessionStore: () => ({}),
                resolveSessionFilePath: () => '/tmp/session.json',
                saveSessionStore: options.saveSessionStore ?? (async () => {})
            }
        }
    } as unknown as PluginRuntime
}

describe('RealOpenClawAdapter', () => {
    beforeEach(() => {
        adapterState.resetForTests()
    })

    it('clears the active run when the initial callback fails', async () => {
        const conversationId = buildHapiSessionKey('default', 'debug-user')
        const callbackClient = new ThrowingCallbackClient(new Error('callback unavailable'))
        const runtime = {} as PluginRuntime
        const adapter = new RealOpenClawAdapter('default', runtime, callbackClient, stubLogger, 0)

        await expect(adapter.sendMessage({
            kind: 'send-message',
            conversationId,
            text: 'hello',
            localMessageId: 'msg-1'
        })).rejects.toThrow('callback unavailable')

        expect(callbackClient.attempts).toBe(3)
        expect(adapter.isConversationBusy(conversationId)).toBe(false)
    })

    it('retries the initial thinking callback before starting the run', async () => {
        const conversationId = buildHapiSessionKey('default', 'debug-user')
        const callbackClient = new SequencedCallbackClient([true, false, false])
        let runCount = 0
        const runtime = createRuntime({
            runEmbeddedPiAgent: async () => {
                runCount += 1
                return {
                    meta: {
                        error: null,
                        finalAssistantVisibleText: null
                    }
                }
            }
        })
        const adapter = new RealOpenClawAdapter('default', runtime, callbackClient, stubLogger, 0)

        await adapter.sendMessage({
            kind: 'send-message',
            conversationId,
            text: 'hello',
            localMessageId: 'msg-1'
        })

        expect(callbackClient.attempts).toBe(3)
        expect(runCount).toBe(1)
        expect(adapter.isConversationBusy(conversationId)).toBe(false)
    })

    it('retries the final thinking=false callback before resolving', async () => {
        const conversationId = buildHapiSessionKey('default', 'debug-user')
        const callbackClient = new SequencedCallbackClient([false, true, false])
        const runtime = createRuntime()
        const adapter = new RealOpenClawAdapter('default', runtime, callbackClient, stubLogger, 0)

        await adapter.sendMessage({
            kind: 'send-message',
            conversationId,
            text: 'hello',
            localMessageId: 'msg-1'
        })

        expect(callbackClient.attempts).toBe(3)
        expect(adapter.isConversationBusy(conversationId)).toBe(false)
    })
})
