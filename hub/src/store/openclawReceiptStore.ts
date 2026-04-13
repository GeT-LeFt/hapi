import type { Database } from 'bun:sqlite'

import type { StoredOpenClawReceipt } from './types'
import {
    claimOpenClawReceipt,
    getOpenClawReceipt,
    markOpenClawReceiptProcessed,
    recordOpenClawReceipt,
    releaseOpenClawReceipt
} from './openclawReceipts'

export class OpenClawReceiptStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getReceipt(namespace: string, eventId: string): StoredOpenClawReceipt | null {
        return getOpenClawReceipt(this.db, namespace, eventId)
    }

    hasProcessedReceipt(namespace: string, eventId: string): boolean {
        const receipt = getOpenClawReceipt(this.db, namespace, eventId)
        return Boolean(receipt?.processedAt)
    }

    recordReceipt(input: {
        namespace: string
        eventId: string
        upstreamConversationId?: string | null
        eventType: string
    }): StoredOpenClawReceipt {
        return recordOpenClawReceipt(this.db, input)
    }

    claim(input: {
        namespace: string
        eventId: string
        upstreamConversationId?: string | null
        eventType: string
    }): { acquired: boolean; receipt: StoredOpenClawReceipt } {
        return claimOpenClawReceipt(this.db, input)
    }

    markProcessed(namespace: string, eventId: string): StoredOpenClawReceipt | null {
        return markOpenClawReceiptProcessed(this.db, namespace, eventId)
    }

    release(namespace: string, eventId: string): boolean {
        return releaseOpenClawReceipt(this.db, namespace, eventId)
    }
}
