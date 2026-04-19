import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

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

function createNotificationId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID()
    }
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([])

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
