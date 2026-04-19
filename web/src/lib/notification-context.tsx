import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Notification = {
    id: string
    title: string
    body: string
    sessionId: string
    url: string
    timestamp: number
    read: boolean
}

export type NotificationContextValue = {
    notifications: Notification[]
    unreadCount: number
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
    removeNotification: (id: string) => void
    markAllRead: () => void
    clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const STORAGE_KEY = 'hapi_notifications'
const MAX_PERSISTED = 50
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function loadNotifications(): Notification[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as Notification[]
        const cutoff = Date.now() - MAX_AGE_MS
        return parsed.filter((n) => n.timestamp > cutoff)
    } catch {
        return []
    }
}

function saveNotifications(notifications: Notification[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_PERSISTED)))
    } catch { /* quota exceeded — silently ignore */ }
}

function createNotificationId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID()
    }
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>(loadNotifications)

    useEffect(() => {
        saveNotifications(notifications)
    }, [notifications])

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.read).length,
        [notifications]
    )

    const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        const entry: Notification = {
            id: createNotificationId(),
            timestamp: Date.now(),
            read: false,
            ...notification
        }
        setNotifications((prev) => [entry, ...prev])
    }, [])

    const removeNotification = useCallback((id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, [])

    const markAllRead = useCallback(() => {
        setNotifications((prev) => {
            if (prev.every((n) => n.read)) return prev
            return prev.map((n) => (n.read ? n : { ...n, read: true }))
        })
    }, [])

    const clearAll = useCallback(() => {
        setNotifications([])
    }, [])

    const value = useMemo<NotificationContextValue>(() => ({
        notifications,
        unreadCount,
        addNotification,
        removeNotification,
        markAllRead,
        clearAll
    }), [notifications, unreadCount, addNotification, removeNotification, markAllRead, clearAll])

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    )
}

export function useNotification(): NotificationContextValue {
    const ctx = useContext(NotificationContext)
    if (!ctx) {
        throw new Error('useNotification must be used within NotificationProvider')
    }
    return ctx
}
