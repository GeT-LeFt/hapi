import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type UnreadContextValue = {
    unreadSessionIds: Set<string>
    markUnread: (sessionId: string) => void
    markRead: (sessionId: string) => void
    clearAll: () => void
}

const UnreadContext = createContext<UnreadContextValue | null>(null)

const STORAGE_KEY = 'hapi_unread_sessions'

function loadUnreadIds(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return new Set()
        return new Set(JSON.parse(raw) as string[])
    } catch {
        return new Set()
    }
}

function saveUnreadIds(ids: Set<string>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
    } catch { /* quota exceeded — silently ignore */ }
}

export function UnreadProvider({ children }: { children: ReactNode }) {
    const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(loadUnreadIds)

    useEffect(() => {
        saveUnreadIds(unreadSessionIds)
    }, [unreadSessionIds])

    const markUnread = useCallback((sessionId: string) => {
        setUnreadSessionIds((prev) => {
            if (prev.has(sessionId)) return prev
            return new Set([...prev, sessionId])
        })
    }, [])

    const markRead = useCallback((sessionId: string) => {
        setUnreadSessionIds((prev) => {
            if (!prev.has(sessionId)) return prev
            const next = new Set(prev)
            next.delete(sessionId)
            return next
        })
    }, [])

    const clearAll = useCallback(() => {
        setUnreadSessionIds(new Set())
    }, [])

    const value = useMemo<UnreadContextValue>(() => ({
        unreadSessionIds,
        markUnread,
        markRead,
        clearAll
    }), [unreadSessionIds, markUnread, markRead, clearAll])

    return (
        <UnreadContext.Provider value={value}>
            {children}
        </UnreadContext.Provider>
    )
}

export function useUnread(): UnreadContextValue {
    const ctx = useContext(UnreadContext)
    if (!ctx) {
        throw new Error('useUnread must be used within UnreadProvider')
    }
    return ctx
}
