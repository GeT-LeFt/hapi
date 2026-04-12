import type { HapiCallbackEvent } from './types'
import { signCallbackBody } from './signing'

export class HapiCallbackClient {
    constructor(
        private readonly hapiBaseUrl: string,
        private readonly sharedSecret: string
    ) {}

    async postEvent(event: HapiCallbackEvent): Promise<void> {
        const rawBody = JSON.stringify(event)
        const timestamp = Date.now()
        const signature = signCallbackBody(timestamp, rawBody, this.sharedSecret)

        const response = await fetch(new URL('/api/openclaw/channel/events', this.hapiBaseUrl).toString(), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-openclaw-timestamp': `${timestamp}`,
                'x-openclaw-signature': signature
            },
            body: rawBody
        })

        if (!response.ok) {
            const text = await response.text().catch(() => '')
            const detail = text ? `: ${text}` : ''
            throw new Error(`HAPI callback failed with HTTP ${response.status}${detail}`)
        }
    }
}
