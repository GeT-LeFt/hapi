import type { Database } from 'bun:sqlite'

import type { StoredOpenClawReceipt } from './types'

type DbOpenClawReceiptRow = {
    id: number
    namespace: string
    event_id: string
    upstream_conversation_id: string | null
    event_type: string
    first_seen_at: number
    processed_at: number | null
}

function toStoredReceipt(row: DbOpenClawReceiptRow): StoredOpenClawReceipt {
    return {
        id: row.id,
        namespace: row.namespace,
        eventId: row.event_id,
        upstreamConversationId: row.upstream_conversation_id,
        eventType: row.event_type,
        firstSeenAt: row.first_seen_at,
        processedAt: row.processed_at
    }
}

export function getOpenClawReceipt(
    db: Database,
    namespace: string,
    eventId: string
): StoredOpenClawReceipt | null {
    const row = db.prepare(
        'SELECT * FROM openclaw_receipts WHERE namespace = ? AND event_id = ? LIMIT 1'
    ).get(namespace, eventId) as DbOpenClawReceiptRow | undefined
    return row ? toStoredReceipt(row) : null
}

export function recordOpenClawReceipt(
    db: Database,
    input: {
        namespace: string
        eventId: string
        upstreamConversationId?: string | null
        eventType: string
    }
): StoredOpenClawReceipt {
    const now = Date.now()
    db.prepare(`
        INSERT OR IGNORE INTO openclaw_receipts (
            namespace, event_id, upstream_conversation_id, event_type, first_seen_at, processed_at
        ) VALUES (
            @namespace, @event_id, @upstream_conversation_id, @event_type, @first_seen_at, NULL
        )
    `).run({
        namespace: input.namespace,
        event_id: input.eventId,
        upstream_conversation_id: input.upstreamConversationId ?? null,
        event_type: input.eventType,
        first_seen_at: now
    })

    const stored = getOpenClawReceipt(db, input.namespace, input.eventId)
    if (!stored) {
        throw new Error('Failed to record OpenClaw receipt')
    }
    return stored
}

export function claimOpenClawReceipt(
    db: Database,
    input: {
        namespace: string
        eventId: string
        upstreamConversationId?: string | null
        eventType: string
    }
): { acquired: boolean; receipt: StoredOpenClawReceipt } {
    const now = Date.now()
    const result = db.prepare(`
        INSERT OR IGNORE INTO openclaw_receipts (
            namespace, event_id, upstream_conversation_id, event_type, first_seen_at, processed_at
        ) VALUES (
            @namespace, @event_id, @upstream_conversation_id, @event_type, @first_seen_at, NULL
        )
    `).run({
        namespace: input.namespace,
        event_id: input.eventId,
        upstream_conversation_id: input.upstreamConversationId ?? null,
        event_type: input.eventType,
        first_seen_at: now
    })

    const stored = getOpenClawReceipt(db, input.namespace, input.eventId)
    if (!stored) {
        throw new Error('Failed to claim OpenClaw receipt')
    }

    return {
        acquired: result.changes > 0,
        receipt: stored
    }
}

export function markOpenClawReceiptProcessed(
    db: Database,
    namespace: string,
    eventId: string
): StoredOpenClawReceipt | null {
    db.prepare(`
        UPDATE openclaw_receipts
        SET processed_at = COALESCE(processed_at, @processed_at)
        WHERE namespace = @namespace
          AND event_id = @event_id
    `).run({
        namespace,
        event_id: eventId,
        processed_at: Date.now()
    })

    return getOpenClawReceipt(db, namespace, eventId)
}

export function releaseOpenClawReceipt(
    db: Database,
    namespace: string,
    eventId: string
): boolean {
    const result = db.prepare(`
        DELETE FROM openclaw_receipts
        WHERE namespace = @namespace
          AND event_id = @event_id
          AND processed_at IS NULL
    `).run({
        namespace,
        event_id: eventId
    })

    return result.changes > 0
}
