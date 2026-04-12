export type OpenClawTransportMode = 'fake' | 'official'

export type OpenClawTransportConfig = {
    mode: OpenClawTransportMode
    pluginBaseUrl: string | null
    sharedSecret: string | null
    timeoutMs: number
    allowedTimestampSkewMs: number
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback
    }
    return parsed
}

export function getOpenClawTransportConfig(): OpenClawTransportConfig {
    const requestedMode = process.env.OPENCLAW_TRANSPORT_MODE?.trim().toLowerCase()
    const mode: OpenClawTransportMode = requestedMode === 'official' ? 'official' : 'fake'

    const pluginBaseUrl = process.env.OPENCLAW_PLUGIN_BASE_URL?.trim() || null
    const sharedSecret = process.env.OPENCLAW_SHARED_SECRET?.trim() || null

    return {
        mode,
        pluginBaseUrl,
        sharedSecret,
        timeoutMs: parsePositiveInt(process.env.OPENCLAW_CHANNEL_TIMEOUT_MS, 30_000),
        allowedTimestampSkewMs: parsePositiveInt(process.env.OPENCLAW_CHANNEL_ALLOWED_SKEW_MS, 300_000)
    }
}
