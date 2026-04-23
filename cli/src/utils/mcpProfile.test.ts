import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findMcpJsonPath, listProfiles, resolveCurrentProfile, switchProfile } from './mcpProfile'

function writeProfile(homeDir: string, profileName: string, config?: unknown): string {
    const profilesDir = path.join(homeDir, '.hapi', 'mcp-profiles')
    mkdirSync(profilesDir, { recursive: true })
    const profilePath = path.join(profilesDir, `${profileName}.json`)
    writeFileSync(profilePath, JSON.stringify(config ?? {
        mcpServers: {
            test: { command: 'echo' }
        }
    }))
    return profilePath
}

describe('mcpProfile utils', () => {
    let tempDir: string

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(os.tmpdir(), 'hapi-mcp-profile-'))
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        rmSync(tempDir, { recursive: true, force: true })
    })

    it('lists valid profiles and ignores backup files', () => {
        writeProfile(tempDir, 'core')
        writeProfile(tempDir, 'dev')
        writeProfile(tempDir, '_backup_original')
        writeProfile(tempDir, 'bad name')

        expect(listProfiles()).toEqual(['core', 'dev'])
    })

    it('finds .mcp.json by walking parent directories', () => {
        const projectRoot = path.join(tempDir, 'workspace')
        const nestedDir = path.join(projectRoot, 'a', 'b')
        mkdirSync(nestedDir, { recursive: true })
        const mcpJsonPath = path.join(projectRoot, '.mcp.json')
        writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: { test: { command: 'echo' } } }))

        expect(findMcpJsonPath(nestedDir)).toBe(mcpJsonPath)
    })

    it('switches profile atomically and resolves current profile from symlink target', () => {
        const corePath = writeProfile(tempDir, 'core', {
            mcpServers: {
                wiki: { type: 'http', url: 'https://example.com/wiki' }
            }
        })
        writeProfile(tempDir, 'dev', {
            mcpServers: {
                db: { command: 'echo' }
            }
        })

        const projectRoot = path.join(tempDir, 'project')
        mkdirSync(projectRoot, { recursive: true })
        const mcpJsonPath = path.join(projectRoot, '.mcp.json')
        writeFileSync(mcpJsonPath, JSON.stringify({
            mcpServers: {
                original: { command: 'echo' }
            }
        }))

        const result = switchProfile(mcpJsonPath, 'core')

        expect(result).toEqual({ ok: true, currentMcpProfile: 'core' })
        expect(resolveCurrentProfile(mcpJsonPath)).toBe('core')
        expect(path.resolve(projectRoot, readlinkSync(mcpJsonPath))).toBe(corePath)

        const backupPath = path.join(tempDir, '.hapi', 'mcp-profiles', '_backup_original.json')
        expect(JSON.parse(readFileSync(backupPath, 'utf8'))).toEqual({
            mcpServers: {
                original: { command: 'echo' }
            }
        })
    })
})
