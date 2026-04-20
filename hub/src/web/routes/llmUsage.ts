import { Hono } from 'hono'
import { z } from 'zod'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import { configuration } from '../../configuration'
import type { WebAppEnv } from '../middleware/auth'

const weekEntrySchema = z.object({
    date: z.string(),
    day: z.string(),
    spend: z.string()
})

const llmUsagePushSchema = z.object({
    updated: z.string(),
    today: z.string(),
    today_spend: z.string(),
    week: z.array(weekEntrySchema),
    week_total: z.string()
})

type LlmUsageData = z.infer<typeof llmUsagePushSchema> & { receivedAt: number }

let cachedUsage: LlmUsageData | null = null

export function createLlmUsagePushRoutes(): Hono {
    const app = new Hono()

    app.post('/llm-usage/push', async (c) => {
        const token = c.req.header('x-push-token')
        const parsedToken = token ? parseAccessToken(token) : null
        if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid token' }, 401)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = llmUsagePushSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body', details: parsed.error.issues }, 400)
        }

        cachedUsage = { ...parsed.data, receivedAt: Date.now() }
        return c.json({ ok: true })
    })

    return app
}

export function createLlmUsageQueryRoutes(): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/llm-usage', (c) => {
        const stale = cachedUsage ? (Date.now() - cachedUsage.receivedAt > 60_000) : true
        return c.json({ data: cachedUsage, stale })
    })

    return app
}
