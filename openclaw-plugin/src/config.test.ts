import { afterEach, describe, expect, it } from 'bun:test'
import { getPluginConfig } from './config'

describe('getPluginConfig', () => {
    afterEach(() => {
        delete process.env.OPENCLAW_PLUGIN_LISTEN_HOST
        delete process.env.OPENCLAW_PLUGIN_LISTEN_PORT
        delete process.env.OPENCLAW_SHARED_SECRET
        delete process.env.HAPI_BASE_URL
        delete process.env.OPENCLAW_PLUGIN_NAMESPACE
    })

    it('reads the simplified required config', () => {
        process.env.OPENCLAW_SHARED_SECRET = 'shared-secret'
        process.env.HAPI_BASE_URL = 'http://127.0.0.1:3006'

        expect(getPluginConfig()).toEqual({
            listenHost: '127.0.0.1',
            listenPort: 3016,
            sharedSecret: 'shared-secret',
            hapiBaseUrl: 'http://127.0.0.1:3006',
            namespace: 'default'
        })
    })

    it('fails clearly when the shared secret is missing', () => {
        process.env.HAPI_BASE_URL = 'http://127.0.0.1:3006'
        expect(() => getPluginConfig()).toThrow('OPENCLAW_SHARED_SECRET')
    })
})
