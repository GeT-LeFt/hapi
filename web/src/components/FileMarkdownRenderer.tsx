import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkDisableIndentedCode from '@/lib/remark-disable-indented-code'
import remarkStripCjkAutolink from '@/lib/remark-strip-cjk-autolink'
import { cn } from '@/lib/utils'
import { useShikiHighlighter } from '@/lib/shiki'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { CopyIcon, CheckIcon } from '@/components/icons'
import type { ComponentPropsWithoutRef } from 'react'

const remarkPlugins = [remarkGfm, remarkStripCjkAutolink, remarkMath, remarkDisableIndentedCode]
const rehypePlugins = [rehypeKatex]

function Pre(props: ComponentPropsWithoutRef<'pre'>) {
    return (
        <div className="aui-md-pre-wrapper min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden">
            <pre
                {...props}
                className={cn(
                    'aui-md-pre m-0 w-max min-w-full rounded-b-md rounded-t-none bg-[var(--app-code-bg)] p-2 text-sm',
                    props.className
                )}
            />
        </div>
    )
}

function CodeBlock(props: ComponentPropsWithoutRef<'code'> & { className?: string }) {
    const { children, className, ...rest } = props
    const match = /language-(\w+)/.exec(className || '')
    const lang = match?.[1]
    const code = String(children).replace(/\n$/, '')
    const { copied, copy } = useCopyToClipboard()
    const highlighted = useShikiHighlighter(code, lang)

    if (lang) {
        return (
            <>
                <div className="aui-md-codeheader flex items-center justify-between rounded-t-md bg-[var(--app-code-bg)] px-2 py-1">
                    <div className="min-w-0 flex-1 pr-2 text-xs font-mono text-[var(--app-hint)]">{lang}</div>
                    <button
                        type="button"
                        onClick={() => copy(code)}
                        className="shrink-0 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                        title="Copy"
                    >
                        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
                <div className="aui-md-codeblock min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden rounded-b-md bg-[var(--app-code-bg)]">
                    <pre className="shiki m-0 w-max min-w-full p-2 text-sm font-mono">
                        <code className="block">{highlighted ?? code}</code>
                    </pre>
                </div>
            </>
        )
    }

    return (
        <code {...rest} className={cn('aui-md-codeblockcode font-mono', className)}>
            {children}
        </code>
    )
}

function InlineCode(props: ComponentPropsWithoutRef<'code'>) {
    return (
        <code
            {...props}
            className={cn(
                'aui-md-code break-words rounded bg-[var(--app-inline-code-bg)] px-[0.3em] py-[0.1em] font-mono text-[0.9em]',
                props.className
            )}
        />
    )
}

function Code(props: ComponentPropsWithoutRef<'code'> & { className?: string; node?: unknown }) {
    const { node: _node, ...rest } = props
    const isBlock = /language-\w+/.test(props.className || '') || (
        typeof props.children === 'string' && props.children.includes('\n')
    )
    if (isBlock) return <CodeBlock {...rest} />
    return <InlineCode {...rest} />
}

const components = {
    pre: Pre,
    code: Code,
    h1: (p: ComponentPropsWithoutRef<'h1'>) => <h1 {...p} className={cn('aui-md-h1 mt-3 text-base font-semibold', p.className)} />,
    h2: (p: ComponentPropsWithoutRef<'h2'>) => <h2 {...p} className={cn('aui-md-h2 mt-3 text-base font-semibold', p.className)} />,
    h3: (p: ComponentPropsWithoutRef<'h3'>) => <h3 {...p} className={cn('aui-md-h3 mt-2 text-base font-semibold', p.className)} />,
    h4: (p: ComponentPropsWithoutRef<'h4'>) => <h4 {...p} className={cn('aui-md-h4 mt-2 text-base font-semibold', p.className)} />,
    h5: (p: ComponentPropsWithoutRef<'h5'>) => <h5 {...p} className={cn('aui-md-h5 mt-2 text-base font-semibold', p.className)} />,
    h6: (p: ComponentPropsWithoutRef<'h6'>) => <h6 {...p} className={cn('aui-md-h6 mt-2 text-base font-semibold', p.className)} />,
    a: (p: ComponentPropsWithoutRef<'a'>) => {
        const rel = p.target === '_blank' ? (p.rel ?? 'noreferrer') : p.rel
        return <a {...p} rel={rel} className={cn('aui-md-a text-[var(--app-link)] underline', p.className)} />
    },
    p: (p: ComponentPropsWithoutRef<'p'>) => <p {...p} className={cn('aui-md-p leading-relaxed', p.className)} />,
    strong: (p: ComponentPropsWithoutRef<'strong'>) => <strong {...p} className={cn('aui-md-strong font-semibold', p.className)} />,
    em: (p: ComponentPropsWithoutRef<'em'>) => <em {...p} className={cn('aui-md-em italic', p.className)} />,
    blockquote: (p: ComponentPropsWithoutRef<'blockquote'>) => (
        <blockquote {...p} className={cn('aui-md-blockquote border-l-4 border-[var(--app-hint)] pl-3 opacity-85', p.className)} />
    ),
    ul: (p: ComponentPropsWithoutRef<'ul'>) => <ul {...p} className={cn('aui-md-ul list-disc pl-6', p.className)} />,
    ol: (p: ComponentPropsWithoutRef<'ol'>) => <ol {...p} className={cn('aui-md-ol list-decimal pl-6', p.className)} />,
    li: (p: ComponentPropsWithoutRef<'li'>) => <li {...p} className={cn('aui-md-li', p.className)} />,
    hr: (p: ComponentPropsWithoutRef<'hr'>) => <hr {...p} className={cn('aui-md-hr border-[var(--app-divider)]', p.className)} />,
    table: (p: ComponentPropsWithoutRef<'table'>) => (
        <div className="aui-md-table-wrapper max-w-full overflow-x-auto">
            <table {...p} className={cn('aui-md-table w-full border-collapse', p.className)} />
        </div>
    ),
    thead: (p: ComponentPropsWithoutRef<'thead'>) => <thead {...p} className={cn('aui-md-thead', p.className)} />,
    tbody: (p: ComponentPropsWithoutRef<'tbody'>) => <tbody {...p} className={cn('aui-md-tbody', p.className)} />,
    tr: (p: ComponentPropsWithoutRef<'tr'>) => <tr {...p} className={cn('aui-md-tr', p.className)} />,
    th: (p: ComponentPropsWithoutRef<'th'>) => (
        <th {...p} className={cn('aui-md-th border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1 text-left font-semibold', p.className)} />
    ),
    td: (p: ComponentPropsWithoutRef<'td'>) => (
        <td {...p} className={cn('aui-md-td border border-[var(--app-border)] px-2 py-1', p.className)} />
    ),
    img: (p: ComponentPropsWithoutRef<'img'>) => <img {...p} className={cn('aui-md-img max-w-full rounded', p.className)} />,
}

export function FileMarkdownRenderer(props: { content: string }) {
    return (
        <div className="aui-md min-w-0 max-w-full break-words text-base">
            <Markdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={components}
            >
                {props.content}
            </Markdown>
        </div>
    )
}
