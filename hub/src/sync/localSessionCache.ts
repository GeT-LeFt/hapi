import type { LocalSession } from '@hapi/protocol/types'

export class LocalSessionCache {
    private cache: Map<string, LocalSession[]> = new Map()

    updateSessions(machineId: string, sessions: LocalSession[]): void {
        this.cache.set(machineId, sessions)
    }

    getSessions(machineId: string): LocalSession[] {
        return this.cache.get(machineId) ?? []
    }

    getAllSessions(): LocalSession[] {
        const all: LocalSession[] = []
        for (const sessions of this.cache.values()) {
            all.push(...sessions)
        }
        return all
    }

    clear(machineId: string): void {
        this.cache.delete(machineId)
    }
}
