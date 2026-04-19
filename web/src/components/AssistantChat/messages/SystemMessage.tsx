import { useState } from 'react'
import { useAssistantState } from '@assistant-ui/react'
import { getEventPresentation } from '@/chat/presentation'
import { cn } from '@/lib/utils'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'

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
            className={cn('transition-transform duration-200', props.open ? 'rotate-90' : '')}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

export function HappySystemMessage() {
    const [isOpen, setIsOpen] = useState(false)

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

    if (role !== 'system') return null

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
                        'mx-auto flex items-center gap-1.5 text-xs font-medium',
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
                        isOpen ? 'max-h-[60vh] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0'
                    )}
                >
                    <div className="mt-2 pl-4 border-l-2 border-[var(--app-border)] ml-0.5 text-xs text-[var(--app-hint)] whitespace-pre-wrap break-words">
                        {text}
                    </div>
                </div>
            </div>
        </div>
    )
}
