import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import type { GitCommandResponse } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { queryKeys } from '@/lib/query-keys'
import { langAlias, useShikiHighlighter } from '@/lib/shiki'
import { decodeBase64 } from '@/lib/utils'

const FileMarkdownRenderer = lazy(() =>
    import('@/components/FileMarkdownRenderer').then((m) => ({ default: m.FileMarkdownRenderer }))
)

const MAX_COPYABLE_FILE_BYTES = 1_000_000

type PreviewType = 'markdown' | 'html' | 'image' | 'pdf' | 'code'
type DisplayMode = 'diff' | 'preview' | 'code'

const IMAGE_MIME: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
}

function getFileExtension(path: string): string {
    const parts = path.split('.')
    return parts.length > 1 ? (parts[parts.length - 1]?.toLowerCase() ?? '') : ''
}

function getPreviewType(path: string): PreviewType {
    const ext = getFileExtension(path)
    if (ext === 'md' || ext === 'mdx') return 'markdown'
    if (ext === 'html' || ext === 'htm') return 'html'
    if (ext in IMAGE_MIME) return 'image'
    if (ext === 'pdf') return 'pdf'
    return 'code'
}

function getImageMime(path: string): string {
    const ext = getFileExtension(path)
    return IMAGE_MIME[ext] ?? 'image/png'
}

function decodePath(value: string): string {
    if (!value) return ''
    const decoded = decodeBase64(value)
    return decoded.ok ? decoded.text : value
}

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function DiffDisplay(props: { diffContent: string }) {
    const lines = props.diffContent.split('\n')

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {lines.map((line, index) => {
                const isAdd = line.startsWith('+') && !line.startsWith('+++')
                const isRemove = line.startsWith('-') && !line.startsWith('---')
                const isHunk = line.startsWith('@@')
                const isHeader = line.startsWith('+++') || line.startsWith('---')

                const className = [
                    'whitespace-pre-wrap px-3 py-0.5 text-xs font-mono',
                    isAdd ? 'bg-[var(--app-diff-added-bg)] text-[var(--app-diff-added-text)]' : '',
                    isRemove ? 'bg-[var(--app-diff-removed-bg)] text-[var(--app-diff-removed-text)]' : '',
                    isHunk ? 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] font-semibold' : '',
                    isHeader ? 'text-[var(--app-hint)] font-semibold' : ''
                ].filter(Boolean).join(' ')

                const style = isAdd
                    ? { borderLeft: '2px solid var(--app-git-staged-color)' }
                    : isRemove
                        ? { borderLeft: '2px solid var(--app-git-deleted-color)' }
                        : undefined

                return (
                    <div key={`${index}-${line}`} className={className} style={style}>
                        {line || ' '}
                    </div>
                )
            })}
        </div>
    )
}

function FileContentSkeleton() {
    const widths = ['w-full', 'w-11/12', 'w-5/6', 'w-3/4', 'w-2/3', 'w-4/5']

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">Loading file…</span>
            <div className="animate-pulse space-y-2 rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3">
                {Array.from({ length: 12 }).map((_, index) => (
                    <div key={`file-skeleton-${index}`} className={`h-3 ${widths[index % widths.length]} rounded bg-[var(--app-subtle-bg)]`} />
                ))}
            </div>
        </div>
    )
}

function resolveLanguage(path: string): string | undefined {
    const parts = path.split('.')
    if (parts.length <= 1) return undefined
    const ext = parts[parts.length - 1]?.toLowerCase()
    if (!ext) return undefined
    return langAlias[ext] ?? ext
}

function getUtf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length
}

function isBinaryContent(content: string): boolean {
    if (!content) return false
    if (content.includes('\0')) return true
    const nonPrintable = content.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return code < 32 && code !== 9 && code !== 10 && code !== 13
    }).length
    return nonPrintable / content.length > 0.1
}

function extractCommandError(result: GitCommandResponse | undefined): string | null {
    if (!result) return null
    if (result.success) return null
    return result.error ?? result.stderr ?? 'Failed to load diff'
}

function MarkdownPreview(props: { content: string }) {
    return (
        <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <div className="min-w-0 max-w-full break-words text-base [&_.aui-md-pre-wrapper]:max-w-full">
                <Suspense fallback={<FileContentSkeleton />}>
                    <FileMarkdownRenderer content={props.content} />
                </Suspense>
            </div>
        </div>
    )
}

function HtmlPreview(props: { content: string; title: string }) {
    return (
        <iframe
            srcDoc={props.content}
            sandbox="allow-scripts"
            className="w-full rounded-md border border-[var(--app-border)] bg-white"
            style={{ minHeight: '400px', height: '70vh' }}
            title={props.title}
        />
    )
}

function ImagePreview(props: { base64: string; filePath: string; fileName: string }) {
    const mime = getImageMime(props.filePath)
    const src = `data:${mime};base64,${props.base64}`

    return (
        <div className="flex items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
            <img
                src={src}
                alt={props.fileName}
                className="max-w-full max-h-[70vh] object-contain"
            />
        </div>
    )
}

function PdfPreview(props: { base64: string; fileName: string }) {
    const src = `data:application/pdf;base64,${props.base64}`

    return (
        <iframe
            src={src}
            className="w-full rounded-md border border-[var(--app-border)]"
            style={{ minHeight: '500px', height: '80vh' }}
            title={props.fileName}
        />
    )
}

function ModeButton(props: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={`rounded px-3 py-1 text-xs font-semibold ${props.active ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
        >
            {props.children}
        </button>
    )
}

export default function FilePage() {
    const { api } = useAppContext()
    const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
    const { copied: contentCopied, copy: copyContent } = useCopyToClipboard()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/file' })
    const search = useSearch({ from: '/sessions/$sessionId/file' })
    const encodedPath = typeof search.path === 'string' ? search.path : ''
    const staged = search.staged

    const filePath = useMemo(() => decodePath(encodedPath), [encodedPath])
    const fileName = filePath.split('/').pop() || filePath || 'File'
    const previewType = useMemo(() => getPreviewType(filePath), [filePath])
    const hasRichPreview = previewType !== 'code'
    const isBinaryPreview = previewType === 'image' || previewType === 'pdf'

    const diffQuery = useQuery({
        queryKey: queryKeys.gitFileDiff(sessionId, filePath, staged),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.getGitDiffFile(sessionId, filePath, staged)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const fileQuery = useQuery({
        queryKey: queryKeys.sessionFile(sessionId, filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.readSessionFile(sessionId, filePath)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const diffContent = diffQuery.data?.success ? (diffQuery.data.stdout ?? '') : ''
    const diffError = extractCommandError(diffQuery.data)
    const diffSuccess = diffQuery.data?.success === true
    const diffFailed = diffQuery.data?.success === false

    const fileContentResult = fileQuery.data
    const rawBase64 = fileContentResult?.success ? (fileContentResult.content ?? '') : ''
    const decodedContentResult = fileContentResult?.success && fileContentResult.content
        ? decodeBase64(fileContentResult.content)
        : { text: '', ok: true }
    const decodedContent = decodedContentResult.text
    const binaryFile = fileContentResult?.success
        ? !decodedContentResult.ok || isBinaryContent(decodedContent)
        : false

    const language = useMemo(() => resolveLanguage(filePath), [filePath])
    const highlighted = useShikiHighlighter(decodedContent, language)
    const contentSizeBytes = useMemo(
        () => (decodedContent ? getUtf8ByteLength(decodedContent) : 0),
        [decodedContent]
    )
    const canCopyContent = fileContentResult?.success === true
        && !binaryFile
        && decodedContent.length > 0
        && contentSizeBytes <= MAX_COPYABLE_FILE_BYTES

    const defaultMode: DisplayMode = hasRichPreview ? 'preview' : 'diff'
    const [displayMode, setDisplayMode] = useState<DisplayMode>(defaultMode)

    useEffect(() => {
        if (hasRichPreview) {
            setDisplayMode('preview')
            return
        }
        if (diffSuccess && !diffContent) {
            setDisplayMode('code')
            return
        }
        if (diffFailed) {
            setDisplayMode('code')
        }
    }, [diffSuccess, diffFailed, diffContent, hasRichPreview])

    const loading = diffQuery.isLoading || fileQuery.isLoading
    const fileError = fileContentResult && !fileContentResult.success
        ? (fileContentResult.error ?? 'Failed to read file')
        : null
    const missingPath = !filePath
    const diffErrorMessage = diffError ? `Diff unavailable: ${diffError}` : null

    const showTabs = hasRichPreview || diffContent

    function renderPreviewContent() {
        if (previewType === 'markdown' && decodedContent) {
            return <MarkdownPreview content={decodedContent} />
        }
        if (previewType === 'html' && decodedContent) {
            return <HtmlPreview content={decodedContent} title={fileName} />
        }
        if (previewType === 'image' && rawBase64) {
            return <ImagePreview base64={rawBase64} filePath={filePath} fileName={fileName} />
        }
        if (previewType === 'pdf' && rawBase64) {
            return <PdfPreview base64={rawBase64} fileName={fileName} />
        }
        return <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
    }

    function renderCodeContent() {
        if (!decodedContent) {
            return <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
        }
        return (
            <div className="relative">
                {canCopyContent ? (
                    <button
                        type="button"
                        onClick={() => copyContent(decodedContent)}
                        className="absolute right-2 top-2 z-10 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                        title="Copy file content"
                    >
                        {contentCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                ) : null}
                <pre className="shiki overflow-auto rounded-md bg-[var(--app-code-bg)] p-3 pr-8 text-xs font-mono">
                    <code>{highlighted ?? decodedContent}</code>
                </pre>
            </div>
        )
    }

    function renderContent() {
        if (missingPath) {
            return <div className="text-sm text-[var(--app-hint)]">No file path provided.</div>
        }
        if (loading) {
            return <FileContentSkeleton />
        }
        if (fileError) {
            return <div className="text-sm text-[var(--app-hint)]">{fileError}</div>
        }

        if (displayMode === 'preview' && hasRichPreview) {
            return renderPreviewContent()
        }

        if (displayMode === 'diff' && diffContent) {
            return <DiffDisplay diffContent={diffContent} />
        }
        if (displayMode === 'diff' && diffError) {
            return <div className="text-sm text-[var(--app-hint)]">{diffError}</div>
        }

        if (displayMode === 'code') {
            if (binaryFile && !isBinaryPreview) {
                return (
                    <div className="text-sm text-[var(--app-hint)]">
                        This looks like a binary file. It cannot be displayed.
                    </div>
                )
            }
            if (isBinaryPreview) {
                return (
                    <div className="text-sm text-[var(--app-hint)]">
                        Binary file — switch to Preview to view.
                    </div>
                )
            }
            return renderCodeContent()
        }

        return <div className="text-sm text-[var(--app-hint)]">No changes to display.</div>
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{fileName}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{filePath || 'Unknown path'}</div>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--app-bg)]">
                <div className="mx-auto w-full max-w-content px-3 py-2 flex items-center gap-2 border-b border-[var(--app-divider)]">
                    <FileIcon fileName={fileName} size={20} />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-hint)]">{filePath}</span>
                    <button
                        type="button"
                        onClick={() => copyPath(filePath)}
                        className="shrink-0 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                        title="Copy path"
                    >
                        {pathCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            {showTabs ? (
                <div className="bg-[var(--app-bg)]">
                    <div className="mx-auto w-full max-w-content px-3 py-2 flex items-center gap-2 border-b border-[var(--app-divider)]">
                        {diffContent ? (
                            <ModeButton active={displayMode === 'diff'} onClick={() => setDisplayMode('diff')}>
                                Diff
                            </ModeButton>
                        ) : null}
                        {hasRichPreview ? (
                            <ModeButton active={displayMode === 'preview'} onClick={() => setDisplayMode('preview')}>
                                Preview
                            </ModeButton>
                        ) : null}
                        <ModeButton active={displayMode === 'code'} onClick={() => setDisplayMode('code')}>
                            Code
                        </ModeButton>
                    </div>
                </div>
            ) : null}

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content p-4">
                    {diffErrorMessage ? (
                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs text-[var(--app-hint)]">
                            {diffErrorMessage}
                        </div>
                    ) : null}
                    {renderContent()}
                </div>
            </div>
        </div>
    )
}
