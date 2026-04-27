import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const scanSchema = z.object({
    machineId: z.string().min(1)
})

const resumeSchema = z.object({
    machineId: z.string().min(1),
    sessionId: z.string().min(1),
    projectPath: z.string().min(1)
})

const deleteSchema = z.object({
    machineId: z.string().min(1),
    projectId: z.string().min(1),
    sessionIds: z.array(z.string().min(1)).min(1)
})

export function createLocalSessionsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/local-sessions', async (c) => {
        const engineOrRes = requireSyncEngine(c, getSyncEngine)
        if (engineOrRes instanceof Response) return engineOrRes
        const engine = engineOrRes

        const machineId = c.req.query('machineId')
        const sessions = engine.getLocalSessions(machineId || undefined)
        return c.json({ sessions })
    })

    app.post('/local-sessions/scan', async (c) => {
        const engineOrRes = requireSyncEngine(c, getSyncEngine)
        if (engineOrRes instanceof Response) return engineOrRes
        const engine = engineOrRes

        const parsed = scanSchema.safeParse(await c.req.json())
        if (!parsed.success) {
            return c.json({ error: 'Invalid request body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const sessions = await engine.scanLocalSessions(parsed.data.machineId, namespace)
            return c.json({ sessions })
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (msg === 'access_denied') return c.json({ error: 'Machine access denied' }, 403)
            if (msg === 'machine_not_found') return c.json({ error: 'Machine not found' }, 404)
            if (msg.includes('RPC handler not registered')) return c.json({ error: 'Machine runner not available' }, 503)
            return c.json({ error: msg }, 500)
        }
    })

    app.post('/local-sessions/resume', async (c) => {
        const engineOrRes = requireSyncEngine(c, getSyncEngine)
        if (engineOrRes instanceof Response) return engineOrRes
        const engine = engineOrRes

        const parsed = resumeSchema.safeParse(await c.req.json())
        if (!parsed.success) {
            return c.json({ error: 'Invalid request body' }, 400)
        }

        const namespace = c.get('namespace')
        const { machineId, sessionId, projectPath } = parsed.data

        const result = await engine.resumeLocalSession(machineId, sessionId, projectPath, namespace)
        if (result.type === 'success') {
            return c.json({ type: 'success', sessionId: result.sessionId })
        }

        const statusMap: Record<string, number> = {
            access_denied: 403,
            session_not_found: 404,
            no_machine_online: 503,
            resume_timeout: 504
        }
        const status = (statusMap[result.code] ?? 500) as 403 | 404 | 500 | 503 | 504
        return c.json(
            { type: 'error', message: result.message, code: result.code },
            status
        )
    })

    app.post('/local-sessions/delete', async (c) => {
        const engineOrRes = requireSyncEngine(c, getSyncEngine)
        if (engineOrRes instanceof Response) return engineOrRes
        const engine = engineOrRes

        const parsed = deleteSchema.safeParse(await c.req.json())
        if (!parsed.success) {
            return c.json({ error: 'Invalid request body' }, 400)
        }

        const namespace = c.get('namespace')
        const { machineId, projectId, sessionIds } = parsed.data

        try {
            const result = await engine.deleteLocalSessions(machineId, projectId, sessionIds, namespace)
            return c.json(result)
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (msg === 'machine_not_found') return c.json({ error: 'Machine not found' }, 404)
            if (msg.includes('RPC handler not registered')) return c.json({ error: 'Machine runner not available' }, 503)
            return c.json({ error: msg }, 500)
        }
    })

    return app
}
