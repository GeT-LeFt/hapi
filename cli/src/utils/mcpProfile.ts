import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    readlinkSync,
    renameSync,
    symlinkSync,
    unlinkSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deterministicStringify } from '@/utils/deterministicJson'

const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/
const BACKUP_PROFILE_NAME = '_backup_original.json'

export type SwitchProfileResult =
    | { ok: true; currentMcpProfile: string }
    | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getProfilesDir(): string {
    return path.join(os.homedir(), '.hapi', 'mcp-profiles')
}

function getBackupProfilePath(): string {
    return path.join(getProfilesDir(), BACKUP_PROFILE_NAME)
}

function isValidProfileName(profileName: string): boolean {
    return PROFILE_NAME_RE.test(profileName)
}

function readJsonFile(filePath: string): unknown {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
}

function readConfigFileIfExists(filePath: string): unknown | null {
    if (!existsSync(filePath)) {
        return null
    }
    return readJsonFile(filePath)
}

function isValidMcpServerEntry(entry: unknown): boolean {
    if (!isRecord(entry)) {
        return false
    }
    return typeof entry.type === 'string'
        || typeof entry.command === 'string'
        || Array.isArray(entry.command)
}

export function validateProfileConfig(config: unknown): string | null {
    if (!isRecord(config)) {
        return 'Invalid profile format'
    }

    const mcpServers = config.mcpServers
    if (!isRecord(mcpServers)) {
        return 'Invalid profile format'
    }

    const entries = Object.entries(mcpServers)
    if (entries.length === 0) {
        return 'Invalid profile format'
    }

    for (const [, entry] of entries) {
        if (!isValidMcpServerEntry(entry)) {
            return 'Invalid profile format'
        }
    }

    return null
}

function getProfilePath(profileName: string): string {
    return path.join(getProfilesDir(), `${profileName}.json`)
}

function resolveProfileLinkTarget(linkPath: string): string | null {
    const stats = lstatSync(linkPath)
    if (!stats.isSymbolicLink()) {
        return null
    }

    const target = readlinkSync(linkPath)
    return path.resolve(path.dirname(linkPath), target)
}

function validateMcpJsonPath(mcpJsonPath: string): string | null {
    if (!path.isAbsolute(mcpJsonPath)) {
        return 'Invalid mcpJsonPath'
    }
    if (path.basename(mcpJsonPath) !== '.mcp.json') {
        return 'Invalid mcpJsonPath'
    }
    const parentDir = path.dirname(mcpJsonPath)
    if (!existsSync(parentDir)) {
        return 'Invalid mcpJsonPath'
    }
    return null
}

function ensureBackupForRegularFile(mcpJsonPath: string): void {
    if (!existsSync(mcpJsonPath)) {
        return
    }

    const stats = lstatSync(mcpJsonPath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
        return
    }

    const backupPath = getBackupProfilePath()
    if (existsSync(backupPath)) {
        return
    }

    mkdirSync(path.dirname(backupPath), { recursive: true })
    copyFileSync(mcpJsonPath, backupPath)
}

export function listProfiles(): string[] {
    const profilesDir = getProfilesDir()
    if (!existsSync(profilesDir)) {
        return []
    }

    return readdirSync(profilesDir)
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => entry.slice(0, -'.json'.length))
        .filter((profileName) => profileName !== '_backup_original')
        .filter((profileName) => isValidProfileName(profileName))
        .sort((left, right) => left.localeCompare(right))
}

export function findMcpJsonPath(cwd: string): string | null {
    let current = path.resolve(cwd)

    while (true) {
        const candidate = path.join(current, '.mcp.json')
        if (existsSync(candidate)) {
            return candidate
        }

        const parent = path.dirname(current)
        if (parent === current) {
            return null
        }
        current = parent
    }
}

export function resolveCurrentProfile(mcpJsonPath: string | null): string | null {
    if (!mcpJsonPath || !existsSync(mcpJsonPath)) {
        return null
    }

    try {
        const linkTarget = resolveProfileLinkTarget(mcpJsonPath)
        if (linkTarget) {
            const profilesDir = getProfilesDir()
            const normalizedDir = path.resolve(profilesDir) + path.sep
            const normalizedTarget = path.resolve(linkTarget)
            if (normalizedTarget.startsWith(normalizedDir) && normalizedTarget.endsWith('.json')) {
                const profileName = path.basename(normalizedTarget, '.json')
                if (isValidProfileName(profileName)) {
                    return profileName
                }
            }
        }
    } catch {
        // Fall back to config comparison below.
    }

    let currentConfig: unknown
    try {
        currentConfig = readJsonFile(mcpJsonPath)
    } catch {
        return null
    }

    let currentConfigKey: string
    try {
        currentConfigKey = deterministicStringify(currentConfig)
    } catch {
        return null
    }

    for (const profileName of listProfiles()) {
        const profilePath = getProfilePath(profileName)
        try {
            const profileConfig = readJsonFile(profilePath)
            if (deterministicStringify(profileConfig) === currentConfigKey) {
                return profileName
            }
        } catch {
            // Ignore unreadable or invalid profiles when probing current state.
        }
    }

    return null
}

export function switchProfile(mcpJsonPath: string, profileName: string): SwitchProfileResult {
    if (!isValidProfileName(profileName)) {
        return { ok: false, error: 'Invalid profile name' }
    }

    const pathError = validateMcpJsonPath(mcpJsonPath)
    if (pathError) {
        return { ok: false, error: pathError }
    }

    const profilePath = getProfilePath(profileName)
    if (!existsSync(profilePath)) {
        return { ok: false, error: 'Profile not found' }
    }

    let profileConfig: unknown
    try {
        profileConfig = readConfigFileIfExists(profilePath)
    } catch {
        return { ok: false, error: 'Invalid profile format' }
    }

    const validationError = validateProfileConfig(profileConfig)
    if (validationError) {
        return { ok: false, error: validationError }
    }

    try {
        ensureBackupForRegularFile(mcpJsonPath)
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    const parentDir = path.dirname(mcpJsonPath)
    const tmpPath = path.join(parentDir, `.mcp.json.hapi-tmp-${process.pid}-${Date.now()}`)

    try {
        symlinkSync(profilePath, tmpPath)
        renameSync(tmpPath, mcpJsonPath)
        return { ok: true, currentMcpProfile: profileName }
    } catch (error) {
        try {
            if (existsSync(tmpPath)) {
                unlinkSync(tmpPath)
            }
        } catch {
            // Ignore temp cleanup errors.
        }
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
}
