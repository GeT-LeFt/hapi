import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildSessionMetadata } from './sessionFactory'

describe('buildSessionMetadata', () => {
    const originalHostname = process.env.HAPI_HOSTNAME
    let tempDir: string | null = null

    afterEach(() => {
        if (originalHostname === undefined) {
            delete process.env.HAPI_HOSTNAME
        } else {
            process.env.HAPI_HOSTNAME = originalHostname
        }
        vi.restoreAllMocks()
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true })
            tempDir = null
        }
    })

    it('uses HAPI_HOSTNAME for session metadata host when provided', () => {
        process.env.HAPI_HOSTNAME = 'custom-session-host'

        const metadata = buildSessionMetadata({
            flavor: 'codex',
            startedBy: 'terminal',
            workingDirectory: '/tmp/project',
            machineId: 'machine-1',
            now: 123
        })

        expect(metadata.host).toBe('custom-session-host')
    })

    it('captures mcpJsonPath and currentMcpProfile from the working tree', () => {
        tempDir = mkdtempSync(path.join(os.tmpdir(), 'session-metadata-'))
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir)

        const profilesDir = path.join(tempDir, '.hapi', 'mcp-profiles')
        mkdirSync(profilesDir, { recursive: true })
        const coreProfilePath = path.join(profilesDir, 'core.json')
        writeFileSync(coreProfilePath, JSON.stringify({
            mcpServers: {
                wiki: { type: 'http', url: 'https://example.com/wiki' }
            }
        }))

        const projectRoot = path.join(tempDir, 'workspace')
        const nestedDir = path.join(projectRoot, 'src')
        mkdirSync(nestedDir, { recursive: true })
        symlinkSync(coreProfilePath, path.join(projectRoot, '.mcp.json'))

        const metadata = buildSessionMetadata({
            flavor: 'claude',
            startedBy: 'terminal',
            workingDirectory: nestedDir,
            machineId: 'machine-1',
            now: 123
        })

        expect(metadata.mcpJsonPath).toBe(path.join(projectRoot, '.mcp.json'))
        expect(metadata.currentMcpProfile).toBe('core')
    })
})
