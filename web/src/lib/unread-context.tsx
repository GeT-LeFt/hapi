import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type UnreadContextValue = {
    unreadSessionIds: Set<string>
    markUnread: (sessionId: string) => void
    markRead: (sessionId: string) => void
    clearAll: () => void
}

const UnreadContext = createContext<UnreadContextValue | null>(null)

export function UnreadProvider({ children }: { children: ReactNode }) {
    const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(new Set())

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
