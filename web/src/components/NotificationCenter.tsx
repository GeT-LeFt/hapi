import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useNotification, type Notification } from '@/lib/notification-context'
import { useTranslation } from '@/lib/use-translation'

const BELL_POS_STORAGE_KEY = 'hapi-bell-position'
const BELL_LONG_PRESS_MS = 300
const BELL_DRAG_THRESHOLD_PX = 5
const BELL_EDGE_MARGIN = 16
const BELL_BUTTON_SIZE = 40

type BellPos = { side: 'left' | 'right'; bottom: number; custom: boolean }

function clamp(v: number, min: number, max: number) {
    return Math.min(max, Math.max(min, v))
}

function loadBellPos(): BellPos {
    const fallback: BellPos = { side: 'right', bottom: BELL_EDGE_MARGIN, custom: false }
    if (typeof window === 'undefined') return fallback
    try {
        const raw = window.localStorage.getItem(BELL_POS_STORAGE_KEY)
        if (!raw) return fallback
        const parsed = JSON.parse(raw)
        if ((parsed?.side === 'left' || parsed?.side === 'right') && typeof parsed?.bottom === 'number') {
            return { side: parsed.side, bottom: parsed.bottom, custom: true }
        }
    } catch {
        // ignore
    }
    return fallback
}

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
    const { notifications, unreadCount, markAllRead, removeNotification, clearAll } = useNotification()
    const [open, setOpen] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    const [pos, setPos] = useState<BellPos>(() => loadBellPos())
    const [dragging, setDragging] = useState(false)
    const [dragPos, setDragPos] = useState<{ left: number; bottom: number } | null>(null)
    const suppressClickRef = useRef(false)
    const pointerStateRef = useRef<{
        pointerId: number
        startX: number
        startY: number
        initialLeft: number
        initialBottom: number
        longPressTimer: number | null
        moved: boolean
        inDragMode: boolean
    } | null>(null)

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const btn = buttonRef.current
        if (!btn) return
        const rect = btn.getBoundingClientRect()
        const st = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            initialLeft: rect.left,
            initialBottom: window.innerHeight - rect.bottom,
            longPressTimer: null as number | null,
            moved: false,
            inDragMode: false,
        }
        pointerStateRef.current = st
        st.longPressTimer = window.setTimeout(() => {
            const cur = pointerStateRef.current
            if (!cur || cur.moved) return
            cur.inDragMode = true
            setDragging(true)
            setDragPos({ left: cur.initialLeft, bottom: cur.initialBottom })
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(15)
            }
            try { btn.setPointerCapture(cur.pointerId) } catch { /* ignore */ }
        }, BELL_LONG_PRESS_MS)
    }, [])

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        const st = pointerStateRef.current
        if (!st || st.pointerId !== e.pointerId) return
        const dx = e.clientX - st.startX
        const dy = e.clientY - st.startY
        if (!st.moved && Math.hypot(dx, dy) > BELL_DRAG_THRESHOLD_PX) {
            st.moved = true
            if (!st.inDragMode && st.longPressTimer !== null) {
                window.clearTimeout(st.longPressTimer)
                st.longPressTimer = null
            }
        }
        if (!st.inDragMode) return
        e.preventDefault()
        const maxLeft = window.innerWidth - BELL_BUTTON_SIZE - BELL_EDGE_MARGIN
        const maxBottom = window.innerHeight - BELL_BUTTON_SIZE - BELL_EDGE_MARGIN
        setDragPos({
            left: clamp(st.initialLeft + dx, BELL_EDGE_MARGIN, maxLeft),
            bottom: clamp(st.initialBottom - dy, BELL_EDGE_MARGIN, maxBottom),
        })
    }, [])

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        const st = pointerStateRef.current
        if (!st || st.pointerId !== e.pointerId) return
        if (st.longPressTimer !== null) {
            window.clearTimeout(st.longPressTimer)
            st.longPressTimer = null
        }
        if (st.inDragMode) {
            const current = dragPos ?? { left: st.initialLeft, bottom: st.initialBottom }
            const center = current.left + BELL_BUTTON_SIZE / 2
            const side: 'left' | 'right' = center < window.innerWidth / 2 ? 'left' : 'right'
            const newPos: BellPos = { side, bottom: current.bottom, custom: true }
            setPos(newPos)
            try {
                window.localStorage.setItem(
                    BELL_POS_STORAGE_KEY,
                    JSON.stringify({ side: newPos.side, bottom: newPos.bottom })
                )
            } catch { /* ignore */ }
            setDragging(false)
            setDragPos(null)
            suppressClickRef.current = true
            try { buttonRef.current?.releasePointerCapture(st.pointerId) } catch { /* ignore */ }
        }
        pointerStateRef.current = null
    }, [dragPos])

    const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        const st = pointerStateRef.current
        if (!st || st.pointerId !== e.pointerId) return
        if (st.longPressTimer !== null) window.clearTimeout(st.longPressTimer)
        if (st.inDragMode) {
            setDragging(false)
            setDragPos(null)
        }
        pointerStateRef.current = null
    }, [])

    useEffect(() => {
        return () => {
            const st = pointerStateRef.current
            if (st && st.longPressTimer !== null) window.clearTimeout(st.longPressTimer)
        }
    }, [])

    const handleToggle = useCallback(() => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
        }
        setOpen((prev) => {
            if (!prev) {
                markAllRead()
            }
            return !prev
        })
    }, [markAllRead])

    const handleNavigate = useCallback((n: Notification) => {
        setOpen(false)
        removeNotification(n.id)
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
    }, [navigate, removeNotification])

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

    const containerStyle: React.CSSProperties = dragging && dragPos
        ? { left: `${dragPos.left}px`, bottom: `${dragPos.bottom}px`, transition: 'none' }
        : pos.custom
            ? {
                [pos.side]: `${BELL_EDGE_MARGIN}px`,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + ${pos.bottom}px)`,
            } as React.CSSProperties
            : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }

    const panelSide = dragging
        ? (dragPos && dragPos.left + BELL_BUTTON_SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right')
        : pos.side
    const panelClass = panelSide === 'left' ? 'absolute bottom-12 left-0' : 'absolute bottom-12 right-0'

    const containerPositionClass = dragging
        ? 'fixed z-40'
        : pos.custom
            ? 'fixed z-40'
            : 'fixed bottom-4 right-4 z-40'

    return (
        <div className={containerPositionClass} style={containerStyle}>
            {open ? (
                <div
                    ref={panelRef}
                    className={`${panelClass} w-80 max-w-[calc(100vw-2rem)] max-h-96 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl flex flex-col overflow-hidden animate-menu-pop`}
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--app-border)] bg-[var(--app-secondary-bg)]">
                        <span className="text-sm font-semibold text-[var(--app-fg)]">
                            {t('notifications.title')}
                        </span>
                        {notifications.length > 0 ? (
                            <button
                                type="button"
                                onClick={handleClearAll}
                                className="text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] transition-colors"
                            >
                                {t('notifications.clearAll')}
                            </button>
                        ) : null}
                    </div>
                    <div className="app-scroll-y flex-1 min-h-0">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-sm text-[var(--app-hint)]">
                                {t('notifications.empty')}
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
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                style={{ touchAction: 'none' }}
                className={`relative h-10 w-10 rounded-full bg-[var(--app-secondary-bg)] border border-[var(--app-border)] shadow-lg flex items-center justify-center text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors ${dragging ? 'scale-110 ring-2 ring-[var(--app-link)] cursor-grabbing' : ''}`}
                title={t('notifications.title')}
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
