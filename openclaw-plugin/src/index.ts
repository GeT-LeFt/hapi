import { serve } from 'bun'
import { getPluginConfig } from './config'
import { HapiCallbackClient } from './hapiClient'
import { MockOpenClawRuntime } from './openclawRuntime'
import { createPluginApp } from './routes'

const config = getPluginConfig()
const callbackClient = new HapiCallbackClient(config.hapiBaseUrl, config.sharedSecret)
const runtime = new MockOpenClawRuntime(config.namespace)
const app = createPluginApp({
    sharedSecret: config.sharedSecret,
    namespace: config.namespace,
    callbackClient,
    runtime,
    idempotencyCache: new Map()
})

serve({
    fetch: app.fetch,
    hostname: config.listenHost,
    port: config.listenPort
})

console.log(`[OpenClawPlugin] listening on http://${config.listenHost}:${config.listenPort}`)
