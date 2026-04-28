import type { Database } from 'bun:sqlite'

import type { StoredMessage } from './types'
import { addMessage, getMessages, getMessagesAfter, mergeSessionMessages, importMessages } from './messages'

export class MessageStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    addMessage(sessionId: string, content: unknown, localId?: string): StoredMessage {
        return addMessage(this.db, sessionId, content, localId)
    }

    getMessages(sessionId: string, limit: number = 200, beforeSeq?: number): StoredMessage[] {
        return getMessages(this.db, sessionId, limit, beforeSeq)
    }

    getMessagesAfter(sessionId: string, afterSeq: number, limit: number = 200): StoredMessage[] {
        return getMessagesAfter(this.db, sessionId, afterSeq, limit)
    }

    mergeSessionMessages(fromSessionId: string, toSessionId: string): { moved: number; oldMaxSeq: number; newMaxSeq: number } {
        return mergeSessionMessages(this.db, fromSessionId, toSessionId)
    }

    importMessages(sessionId: string, messages: Array<{ content: unknown, createdAt: number }>): number {
        return importMessages(this.db, sessionId, messages)
    }
}
