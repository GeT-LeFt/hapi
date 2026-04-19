import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useNotification, type Notification } from '@/lib/notification-context'
import { useTranslation } from '@/lib/use-translation'

function BellIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    )
}

function formatTimeAgo(timestamp: number): string {
    const delta = Date.now() - timestamp
    if (delta < 60_000) return 'just now'
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

function NotificationItem({ notification, onNavigate }: { notification: Notification; onNavigate: (n: Notification) => void }) {
    return (
        <button
            type="button"
            onClick={() => onNavigate(notification)}
            className="w-full text-left px-3 py-2.5 border-b border-[var(--app-border)] hover:bg-[var(--app-subtle-bg)] transition-colors"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        {!notification.read ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-link)] shrink-0" />
                        ) : null}
                        <span className="text-sm font-medium truncate text-[var(--app-fg)]">
                            {notification.title}
                        </span>
                    </div>
                    <div className="text-xs text-[var(--app-hint)] mt-0.5 line-clamp-2">{notification.body}</div>
                </div>
                <span className="text-[10px] text-[var(--app-hint)] shrink-0 mt-0.5">
                    {formatTimeAgo(notification.timestamp)}
                </span>
            </div>
        </button>
    )
}

export function NotificationCenter() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { notifications, unreadCount, markAllRead, clearAll } = useNotification()
    const [open, setOpen] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    const handleToggle = useCallback(() => {
        setOpen((prev) => {
            if (!prev) {
                markAllRead()
            }
            return !prev
        })
    }, [markAllRead])

    const handleNavigate = useCallback((n: Notification) => {
        setOpen(false)
        if (n.sessionId) {
            void navigate({
                to: '/sessions/$sessionId',
                params: { sessionId: n.sessionId }
            })
            return
        }
        if (n.url) {
            void navigate({ to: n.url })
        }
    }, [navigate])

    const handleClearAll = useCallback(() => {
        clearAll()
        setOpen(false)
    }, [clearAll])

    useEffect(() => {
        if (!open) return
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node
            if (
                panelRef.current && !panelRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [open])

    return (
        <div className="fixed bottom-4 right-4 z-40" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
            {open ? (
                <div
                    ref={panelRef}
                    className="absolute bottom-12 right-0 w-80 max-w-[calc(100vw-2rem)] max-h-96 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl flex flex-col overflow-hidden animate-menu-pop"
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--app-border)] bg-[var(--app-secondary-bg)]">
                        <span className="text-sm font-semibold text-[var(--app-fg)]">
                            {t('notifications.title', { defaultValue: 'Notifications' })}
                        </span>
                        {notifications.length > 0 ? (
                            <button
                                type="button"
                                onClick={handleClearAll}
                                className="text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] transition-colors"
                            >
                                {t('notifications.clearAll', { defaultValue: 'Clear all' })}
                            </button>
                        ) : null}
                    </div>
                    <div className="app-scroll-y flex-1 min-h-0">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-sm text-[var(--app-hint)]">
                                {t('notifications.empty', { defaultValue: 'No notifications' })}
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <NotificationItem key={n.id} notification={n} onNavigate={handleNavigate} />
                            ))
                        )}
                    </div>
                </div>
            ) : null}

            <button
                ref={buttonRef}
                type="button"
                onClick={handleToggle}
                className="relative h-10 w-10 rounded-full bg-[var(--app-secondary-bg)] border border-[var(--app-border)] shadow-lg flex items-center justify-center text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                title={t('notifications.title', { defaultValue: 'Notifications' })}
            >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 ? (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                ) : null}
            </button>
        </div>
    )
}
