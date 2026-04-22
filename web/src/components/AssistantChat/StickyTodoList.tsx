import { useEffect, useMemo, useState } from 'react'
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

function todosSignature(todos: TodoItem[]): string {
    return todos.map(t => `${t.id}:${t.status}`).join('|')
}

function dismissKey(sessionId: string | undefined): string | null {
    if (!sessionId) return null
    return `hapi:stickyTodo:dismissed:${sessionId}`
}

export function StickyTodoList(props: { todos?: TodoItem[]; sessionId?: string }) {
    const todos = props.todos
    const [collapsed, setCollapsed] = useState(false)
    const [dismissedSig, setDismissedSig] = useState<string | null>(null)

    const hasTodos = !!todos && todos.length > 0
    const signature = useMemo(() => (hasTodos ? todosSignature(todos!) : ''), [todos, hasTodos])

    useEffect(() => {
        const key = dismissKey(props.sessionId)
        if (!key) {
            setDismissedSig(null)
            return
        }
        try {
            setDismissedSig(window.localStorage.getItem(key))
        } catch {
            setDismissedSig(null)
        }
    }, [props.sessionId])

    if (!hasTodos) return null
    if (dismissedSig && dismissedSig === signature) return null

    const completedCount = todos!.filter(t => t.status === 'completed').length
    const totalCount = todos!.length
    const inProgressItem = todos!.find(t => t.status === 'in_progress')
    const allDone = completedCount === totalCount

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation()
        const key = dismissKey(props.sessionId)
        if (key) {
            try {
                window.localStorage.setItem(key, signature)
            } catch {
                // ignore quota/privacy errors
            }
        }
        setDismissedSig(signature)
    }

    return (
        <div className={`border-t border-[var(--app-divider)] bg-[var(--app-bg)] ${allDone ? 'opacity-70' : ''}`}>
            <div className="mx-auto w-full max-w-content px-3 py-2">
                <div className="flex w-full items-center justify-between">
                    <button
                        type="button"
                        className="flex flex-1 cursor-pointer items-center gap-2 text-left"
                        onClick={() => setCollapsed(c => !c)}
                    >
                        <span className="text-xs text-[var(--app-hint)]">
                            {collapsed ? '▸' : '▾'}
                        </span>
                        <span className="text-xs font-medium text-[var(--app-fg)]">
                            Todo
                        </span>
                        <span className="text-xs text-[var(--app-hint)]">
                            {completedCount}/{totalCount}
                        </span>
                        {collapsed && inProgressItem ? (
                            <span className="ml-2 truncate text-xs text-[var(--app-link)]">
                                {inProgressItem.content}
                            </span>
                        ) : null}
                    </button>
                    <button
                        type="button"
                        aria-label="Dismiss todo list"
                        className="ml-2 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--app-hint)] hover:bg-[var(--app-divider)] hover:text-[var(--app-fg)]"
                        onClick={handleDismiss}
                    >
                        <span className="text-xs leading-none">×</span>
                    </button>
                </div>

                {!collapsed ? (
                    <div className="mt-1.5 flex flex-col gap-0.5">
                        {todos!.map((item) => (
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
