import type { PluginConfig } from './types'

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readRequiredEnv(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`Missing required environment variable ${name}`)
    }
    return value
}

export function getPluginConfig(): PluginConfig {
    return {
        listenHost: process.env.OPENCLAW_PLUGIN_LISTEN_HOST?.trim() || '127.0.0.1',
        listenPort: parsePositiveInt(process.env.OPENCLAW_PLUGIN_LISTEN_PORT, 3016),
        sharedSecret: readRequiredEnv('OPENCLAW_SHARED_SECRET'),
        hapiBaseUrl: readRequiredEnv('HAPI_BASE_URL'),
        namespace: process.env.OPENCLAW_PLUGIN_NAMESPACE?.trim() || 'default'
    }
}
