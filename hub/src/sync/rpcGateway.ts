import type { CodexCollaborationMode, PermissionMode, LocalSession } from '@hapi/protocol/types'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'

export type RpcCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type RpcReadFileResponse = {
    success: boolean
    content?: string
    error?: string
}

export type RpcUploadFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type RpcDeleteUploadResponse = {
    success: boolean
    error?: string
}

export type RpcDirectoryEntry = {
    name: string
    type: 'file' | 'directory' | 'other'
    size?: number
    modified?: number
}

export type RpcListDirectoryResponse = {
    success: boolean
    entries?: RpcDirectoryEntry[]
    error?: string
}

export type RpcCreateDirectoryResponse = {
    success: boolean
    error?: string
}

export type RpcWriteProjectFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type RpcPathExistsResponse = {
    exists: Record<string, boolean>
}

export type RpcSwitchMcpProfileResponse =
    | { ok: true; currentMcpProfile: string }
    | { ok: false; error: string }

export class RpcGateway {
    constructor(
        private readonly io: Server,
        private readonly rpcRegistry: RpcRegistry
    ) {
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.sessionRpc(sessionId, 'permission', {
            id: requestId,
            approved: true,
            mode,
            allowTools,
            decision,
            answers
        })
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.sessionRpc(sessionId, 'permission', {
            id: requestId,
            approved: false,
            decision
        })
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'abort', { reason: 'User aborted via Telegram Bot' })
    }

    async switchSession(sessionId: string, to: 'remote' | 'local'): Promise<void> {
        await this.sessionRpc(sessionId, 'switch', { to })
    }

    async requestSessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            model?: string | null
            modelReasoningEffort?: string | null
            effort?: string | null
            collaborationMode?: CodexCollaborationMode
        }
    ): Promise<unknown> {
        return await this.sessionRpc(sessionId, 'set-session-config', config)
    }

    async killSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'killSession', {})
    }

    async spawnSession(
        machineId: string,
        directory: string,
        agent: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' = 'claude',
        model?: string,
        modelReasoningEffort?: string,
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        resumeSessionId?: string,
        effort?: string,
        permissionMode?: PermissionMode,
        apiProfile?: string
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        try {
            const result = await this.machineRpc(
                machineId,
                'spawn-happy-session',
                { type: 'spawn-in-directory', directory, agent, model, modelReasoningEffort, yolo, sessionType, worktreeName, resumeSessionId, effort, permissionMode, apiProfile }
            )
            if (result && typeof result === 'object') {
                const obj = result as Record<string, unknown>
                if (obj.type === 'success' && typeof obj.sessionId === 'string') {
                    return { type: 'success', sessionId: obj.sessionId }
                }
                if (obj.type === 'error' && typeof obj.errorMessage === 'string') {
                    return { type: 'error', message: obj.errorMessage }
                }
                if (obj.type === 'requestToApproveDirectoryCreation' && typeof obj.directory === 'string') {
                    return { type: 'error', message: `Directory creation requires approval: ${obj.directory}` }
                }
                if (typeof obj.error === 'string') {
                    return { type: 'error', message: obj.error }
                }
                if (obj.type !== 'success' && typeof obj.message === 'string') {
                    return { type: 'error', message: obj.message }
                }
            }
            const details = typeof result === 'string'
                ? result
                : (() => {
                    try {
                        return JSON.stringify(result)
                    } catch {
                        return String(result)
                    }
                })()
            return { type: 'error', message: `Unexpected spawn result: ${details}` }
        } catch (error) {
            return { type: 'error', message: error instanceof Error ? error.message : String(error) }
        }
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        const result = await this.machineRpc(machineId, 'path-exists', { paths }) as RpcPathExistsResponse | unknown
        if (!result || typeof result !== 'object') {
            throw new Error('Unexpected path-exists result')
        }

        const existsValue = (result as RpcPathExistsResponse).exists
        if (!existsValue || typeof existsValue !== 'object') {
            throw new Error('Unexpected path-exists result')
        }

        const exists: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(existsValue)) {
            exists[key] = value === true
        }
        return exists
    }

    async switchMcpProfile(
        machineId: string,
        input: { profile: string; mcpJsonPath: string }
    ): Promise<RpcSwitchMcpProfileResponse> {
        const result = await this.machineRpc(machineId, 'switch-mcp-profile', input) as RpcSwitchMcpProfileResponse | unknown
        if (!result || typeof result !== 'object' || typeof (result as { ok?: unknown }).ok !== 'boolean') {
            throw new Error('Unexpected switch-mcp-profile result')
        }

        if ((result as { ok: boolean }).ok) {
            const currentMcpProfile = (result as { currentMcpProfile?: unknown }).currentMcpProfile
            if (typeof currentMcpProfile !== 'string' || currentMcpProfile.length === 0) {
                throw new Error('Invalid switch-mcp-profile success result')
            }
            return { ok: true, currentMcpProfile }
        }

        const error = (result as { error?: unknown }).error
        if (typeof error !== 'string' || error.length === 0) {
            throw new Error('Invalid switch-mcp-profile error result')
        }
        return { ok: false, error }
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-status', { cwd }) as RpcCommandResponse
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-diff-numstat', options) as RpcCommandResponse
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-diff-file', options) as RpcCommandResponse
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.sessionRpc(sessionId, 'readFile', { path }) as RpcReadFileResponse
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.sessionRpc(sessionId, 'listDirectory', { path }) as RpcListDirectoryResponse
    }

    async createDirectory(sessionId: string, path: string): Promise<RpcCreateDirectoryResponse> {
        return await this.sessionRpc(sessionId, 'createDirectory', { path }) as RpcCreateDirectoryResponse
    }

    async writeProjectFile(sessionId: string, path: string, content: string, overwrite?: boolean): Promise<RpcWriteProjectFileResponse> {
        return await this.sessionRpc(sessionId, 'writeProjectFile', { path, content, overwrite }) as RpcWriteProjectFileResponse
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.sessionRpc(sessionId, 'uploadFile', { sessionId, filename, content, mimeType }, 120_000) as RpcUploadFileResponse
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.sessionRpc(sessionId, 'deleteUpload', { sessionId, path }) as RpcDeleteUploadResponse
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'ripgrep', { args, cwd }) as RpcCommandResponse
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.sessionRpc(sessionId, 'listSlashCommands', { agent }) as {
            success: boolean
            commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
            error?: string
        }
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.sessionRpc(sessionId, 'listSkills', {}) as {
            success: boolean
            skills?: Array<{ name: string; description?: string }>
            error?: string
        }
    }

    async cleanupSessionBlobs(machineId: string, sessionId: string): Promise<void> {
        try {
            await this.machineRpc(machineId, 'cleanupBlobDir', { sessionId })
        } catch {
            // CLI offline — orphan GC will handle it
        }
    }

    async scanLocalSessions(machineId: string): Promise<LocalSession[]> {
        const result = await this.machineRpc(machineId, 'scan-local-sessions', {}) as { sessions?: unknown }
        if (!result || typeof result !== 'object' || !Array.isArray(result.sessions)) {
            throw new Error('Unexpected scan-local-sessions result')
        }
        return result.sessions as LocalSession[]
    }

    async readSessionMessages(machineId: string, projectId: string, sessionId: string): Promise<Array<{ role: string, content: unknown, timestamp: number }>> {
        const result = await this.machineRpc(machineId, 'read-session-messages', { projectId, sessionId }) as { messages?: unknown }
        if (!result || typeof result !== 'object' || !Array.isArray(result.messages)) {
            return []
        }
        return result.messages as Array<{ role: string, content: unknown, timestamp: number }>
    }

    async deleteLocalSessions(
        machineId: string,
        projectId: string,
        sessionIds: string[]
    ): Promise<{ deleted: string[]; failed: Array<{ sessionId: string; error: string }> }> {
        const result = await this.machineRpc(machineId, 'delete-local-sessions', { projectId, sessionIds }) as {
            deleted?: string[]
            failed?: Array<{ sessionId: string; error: string }>
        }
        return {
            deleted: Array.isArray(result?.deleted) ? result.deleted : [],
            failed: Array.isArray(result?.failed) ? result.failed : []
        }
    }

    private async sessionRpc(sessionId: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
        return await this.rpcCall(`${sessionId}:${method}`, params, timeoutMs)
    }

    private async machineRpc(machineId: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
        return await this.rpcCall(`${machineId}:${method}`, params, timeoutMs)
    }

    private async rpcCall(method: string, params: unknown, timeoutMs: number = 30_000): Promise<unknown> {
        const socketId = this.rpcRegistry.getSocketIdForMethod(method)
        if (!socketId) {
            throw new Error(`RPC handler not registered: ${method}`)
        }

        const socket = this.io.of('/cli').sockets.get(socketId)
        if (!socket) {
            throw new Error(`RPC socket disconnected: ${method}`)
        }

        const response = await socket.timeout(timeoutMs).emitWithAck('rpc-request', {
            method,
            params: JSON.stringify(params)
        }) as unknown

        if (typeof response !== 'string') {
            return response
        }

        try {
            return JSON.parse(response) as unknown
        } catch {
            return response
        }
    }
}
