import { useState, lazy, Suspense } from 'react'
import { useAssistantState } from '@assistant-ui/react'
import { getEventPresentation } from '@/chat/presentation'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { cn } from '@/lib/utils'

const FileMarkdownRenderer = lazy(() =>
    import('@/components/FileMarkdownRenderer').then((m) => ({ default: m.FileMarkdownRenderer }))
)

const COLLAPSE_THRESHOLD = 200

function ChevronIcon(props: { open?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
                'transition-transform duration-200',
                props.open ? 'rotate-90' : ''
            )}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

export function HappySystemMessage() {
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'system') return ''
        return message.content[0]?.type === 'text' ? message.content[0].text : ''
    })
    const icon = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event ? getEventPresentation(event).icon : null
    })

    const eventType = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event?.type ?? null
    })
    const turnDurationMs = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        const event = custom?.kind === 'event' ? custom.event : undefined
        if (event?.type !== 'turn-duration') return null
        return typeof (event as Record<string, unknown>).durationMs === 'number'
            ? (event as Record<string, unknown>).durationMs as number
            : null
    })

    const [isOpen, setIsOpen] = useState(false)

    if (role !== 'system') return null

    if (eventType === 'turn-duration' && turnDurationMs !== null) {
        const seconds = turnDurationMs / 1000
        const label = seconds < 60
            ? `${seconds.toFixed(1)}s`
            : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
        return (
            <div className="py-2">
                <div className="mx-auto w-fit px-3 py-1 rounded-full bg-[var(--app-secondary-bg)] border border-[var(--app-border)]">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--app-hint)]">
                        <span aria-hidden="true">⏱️</span>
                        <span>本次回答耗时 {label}</span>
                    </span>
                </div>
            </div>
        )
    }

    const isLong = text.length > COLLAPSE_THRESHOLD

    if (!isLong) {
        return (
            <div className="py-1">
                <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                    <span className="inline-flex items-center gap-1">
                        {icon ? <span aria-hidden="true">{icon}</span> : null}
                        <span>{text}</span>
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="py-1">
            <div className="mx-auto max-w-[92%] px-2">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        'flex items-center gap-1.5 text-xs font-medium mx-auto',
                        'text-[var(--app-hint)] hover:text-[var(--app-fg)]',
                        'transition-colors cursor-pointer select-none'
                    )}
                >
                    <ChevronIcon open={isOpen} />
                    <span>📦</span>
                    <span>Conversation summary</span>
                </button>

                <div
                    className={cn(
                        'overflow-hidden transition-all duration-200 ease-in-out',
                        isOpen ? 'max-h-[60vh] opacity-100 mt-2' : 'max-h-0 opacity-0'
                    )}
                >
                    <div
                        className={cn(
                            'max-h-[60vh] overflow-y-auto',
                            'pl-4 border-l-2 border-[var(--app-border)] ml-0.5',
                            'text-xs text-[var(--app-hint)] break-words',
                            '[&_.aui-md]:text-xs [&_.aui-md]:text-[var(--app-hint)]',
                            '[&_.aui-md-h1]:text-xs [&_.aui-md-h2]:text-xs [&_.aui-md-h3]:text-xs',
                            '[&_.aui-md-pre-wrapper]:max-w-full'
                        )}
                    >
                        <Suspense fallback={<div className="whitespace-pre-wrap">{text}</div>}>
                            <FileMarkdownRenderer content={text} />
                        </Suspense>
                    </div>
                </div>
            </div>
        </div>
    )
}
