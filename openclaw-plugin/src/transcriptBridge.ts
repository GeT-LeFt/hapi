import type { OpenClawPluginService, OpenClawPluginServiceContext } from 'openclaw/plugin-sdk/plugin-entry'
import { HapiCallbackClient } from './hapiClient'
import { normalizeAssistantTranscriptEvent } from './transcriptEvents'
import { runtimeStore } from './runtimeStore'
import { OPENCLAW_PLUGIN_ID } from './pluginId'
import type { PluginConfig } from './types'

const TRANSCRIPT_CALLBACK_RETRY_BASE_DELAY_MS = 1000

type TranscriptUpdate = {
    sessionKey?: string
    messageId?: string
    message?: unknown
}

type TranscriptMessageEvent = ReturnType<typeof normalizeAssistantTranscriptEvent>

type PendingTranscriptDelivery = {
    event: NonNullable<TranscriptMessageEvent>
    processing: boolean
    timer: ReturnType<typeof setTimeout> | null
    attempt: number
}

export async function handleTranscriptUpdate(
    callbackClient: HapiCallbackClient,
    update: TranscriptUpdate
): Promise<void> {
    const event = normalizeAssistantTranscriptEvent(update)
    if (!event) {
        return
    }

    await callbackClient.postEvent(event)
}

function getTranscriptDeliveryKey(event: NonNullable<TranscriptMessageEvent>): string {
    return `${event.namespace}:${event.conversationId}:${event.externalMessageId}`
}

export function createTranscriptUpdateDispatcher(input: {
    callbackClient: HapiCallbackClient
    logger: Pick<OpenClawPluginServiceContext['logger'], 'warn' | 'error'>
    retryBaseDelayMs?: number
}) {
    const retryBaseDelayMs = input.retryBaseDelayMs ?? TRANSCRIPT_CALLBACK_RETRY_BASE_DELAY_MS
    const pending = new Map<string, PendingTranscriptDelivery>()
    let stopped = false

    const process = (key: string) => {
        const entry = pending.get(key)
        if (!entry || entry.processing || stopped) {
            return
        }

        entry.processing = true
        const sentEvent = entry.event

        void input.callbackClient.postEvent(sentEvent).then(() => {
            const current = pending.get(key)
            if (!current) {
                return
            }

            current.processing = false
            current.attempt = 0
            if (current.event === sentEvent) {
                if (current.timer) {
                    clearTimeout(current.timer)
                    current.timer = null
                }
                pending.delete(key)
                return
            }

            process(key)
        }).catch((error) => {
            const current = pending.get(key)
            if (!current) {
                return
            }

            current.processing = false
            if (current.event !== sentEvent) {
                current.attempt = 0
                process(key)
                return
            }

            current.attempt += 1
            const retryDelayMs = retryBaseDelayMs * current.attempt
            input.logger.warn(
                `Retrying transcript callback conversation=${sentEvent.conversationId} `
                + `message=${sentEvent.externalMessageId} attempt=${current.attempt}: `
                + (error instanceof Error ? error.message : String(error))
            )
            if (current.timer) {
                clearTimeout(current.timer)
            }
            current.timer = setTimeout(() => {
                const next = pending.get(key)
                if (!next || stopped) {
                    return
                }
                next.timer = null
                process(key)
            }, retryDelayMs)
        })
    }

    return {
        enqueue(update: TranscriptUpdate) {
            if (stopped) {
                return
            }

            const event = normalizeAssistantTranscriptEvent(update)
            if (!event) {
                return
            }

            const key = getTranscriptDeliveryKey(event)
            const existing = pending.get(key)
            if (existing) {
                existing.event = event
                existing.attempt = 0
                if (existing.timer) {
                    clearTimeout(existing.timer)
                    existing.timer = null
                }
            } else {
                pending.set(key, {
                    event,
                    processing: false,
                    timer: null,
                    attempt: 0
                })
            }

            process(key)
        },
        stop() {
            stopped = true
            for (const entry of pending.values()) {
                if (entry.timer) {
                    clearTimeout(entry.timer)
                }
            }
            pending.clear()
        }
    }
}

export function createTranscriptBridgeService(config: PluginConfig): OpenClawPluginService {
    let stopListening: (() => void) | null = null
    let stopDispatching: (() => void) | null = null

    return {
        id: `${OPENCLAW_PLUGIN_ID}:transcript-bridge`,
        async start(ctx) {
            const callbackClient = new HapiCallbackClient(config.hapiBaseUrl, config.sharedSecret)
            const runtime = runtimeStore.getRuntime()
            const dispatcher = createTranscriptUpdateDispatcher({
                callbackClient,
                logger: ctx.logger
            })
            stopDispatching = () => {
                dispatcher.stop()
            }

            stopListening = runtime.events.onSessionTranscriptUpdate((update) => {
                dispatcher.enqueue(update)
            })

            ctx.logger.info(`Started ${OPENCLAW_PLUGIN_ID} transcript-bridge service`)
        },
        async stop() {
            stopListening?.()
            stopListening = null
            stopDispatching?.()
            stopDispatching = null
        }
    }
}
