import { useEffect, useRef, useState } from 'react'
import type { TodoItem } from '@/types/api'

function todoIcon(status: string) {
    if (status === 'completed') return '☑'
    if (status === 'in_progress') return '◉'
    return '☐'
}

function todoStyle(status: string) {
    if (status === 'completed') return 'text-emerald-600 line-through opacity-60'
    if (status === 'in_progress') return 'text-[var(--app-link)] font-medium'
    return 'text-[var(--app-hint)]'
}

export function StickyTodoList(props: { todos?: TodoItem[] }) {
    const todos = props.todos
    const [collapsed, setCollapsed] = useState(false)
    const [visible, setVisible] = useState(false)
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

    const hasTodos = todos && todos.length > 0
    const completedCount = hasTodos ? todos.filter(t => t.status === 'completed').length : 0
    const totalCount = hasTodos ? todos.length : 0
    const allDone = hasTodos && completedCount === totalCount
    const inProgressItem = hasTodos ? todos.find(t => t.status === 'in_progress') : null

    useEffect(() => {
        if (fadeTimerRef.current) {
            clearTimeout(fadeTimerRef.current)
            fadeTimerRef.current = null
        }

        if (hasTodos && !allDone) {
            setVisible(true)
        } else if (hasTodos && allDone) {
            setVisible(true)
            fadeTimerRef.current = setTimeout(() => setVisible(false), 5000)
        } else {
            setVisible(false)
        }

        return () => {
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
        }
    }, [hasTodos, allDone])

    if (!visible || !hasTodos) return null

    return (
        <div className={`border-t border-[var(--app-divider)] bg-[var(--app-bg)] transition-opacity duration-500 ${allDone ? 'opacity-50' : 'opacity-100'}`}>
            <div className="mx-auto w-full max-w-content px-3 py-2">
                <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between text-left"
                    onClick={() => setCollapsed(c => !c)}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--app-hint)]">
                            {collapsed ? '▸' : '▾'}
                        </span>
                        <span className="text-xs font-medium text-[var(--app-fg)]">
                            Todo
                        </span>
                        <span className="text-xs text-[var(--app-hint)]">
                            {completedCount}/{totalCount}
                        </span>
                    </div>
                    {collapsed && inProgressItem ? (
                        <span className="truncate text-xs text-[var(--app-link)]">
                            {inProgressItem.content}
                        </span>
                    ) : null}
                </button>

                {!collapsed ? (
                    <div className="mt-1.5 flex flex-col gap-0.5">
                        {todos.map((item) => (
                            <div key={item.id} className={`text-xs leading-relaxed ${todoStyle(item.status)}`}>
                                <span className="mr-1">{todoIcon(item.status)}</span>
                                <span>{item.content}</span>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
