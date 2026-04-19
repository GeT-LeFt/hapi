import { useCallback, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { FileIcon } from '@/components/FileIcon'
import { useSessionDirectory } from '@/hooks/queries/useSessionDirectory'

function ChevronIcon(props: { className?: string; collapsed: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} transition-transform duration-200 ${props.collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function FolderIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

function DownloadIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    )
}

function UploadIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    )
}

function FolderPlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
    )
}

function SpinnerIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} animate-spin`}
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

function DirectorySkeleton(props: { depth: number; rows?: number }) {
    const rows = props.rows ?? 4
    const indent = 12 + props.depth * 14

    return (
        <div className="animate-pulse">
            {Array.from({ length: rows }).map((_, index) => (
                <div
                    key={`dir-skel-${props.depth}-${index}`}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ paddingLeft: indent }}
                >
                    <div className="h-5 w-5 rounded bg-[var(--app-subtle-bg)]" />
                    <div className="h-3 w-40 rounded bg-[var(--app-subtle-bg)]" />
                </div>
            ))}
        </div>
    )
}

function DirectoryErrorRow(props: { depth: number; message: string }) {
    const indent = 12 + props.depth * 14
    return (
        <div
            className="px-3 py-2 text-xs text-[var(--app-hint)] bg-amber-500/10"
            style={{ paddingLeft: indent }}
        >
            {props.message}
        </div>
    )
}

function NewFolderInput(props: {
    depth: number
    onConfirm: (name: string) => void
    onCancel: () => void
}) {
    const [name, setName] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const indent = 12 + props.depth * 14

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && name.trim()) {
            props.onConfirm(name.trim())
        } else if (e.key === 'Escape') {
            props.onCancel()
        }
    }

    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ paddingLeft: indent }}
        >
            <span className="h-4 w-4" />
            <FolderIcon className="text-[var(--app-link)]" />
            <input
                ref={inputRef}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="folder name"
                className="flex-1 min-w-0 bg-transparent text-sm text-[var(--app-fg)] placeholder:text-[var(--app-hint)] border-b border-[var(--app-link)] focus:outline-none py-0.5"
            />
            <button
                type="button"
                onClick={() => name.trim() && props.onConfirm(name.trim())}
                disabled={!name.trim()}
                className="text-[var(--app-link)] hover:text-[var(--app-fg)] disabled:opacity-30 p-0.5"
                title="Confirm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
            <button
                type="button"
                onClick={props.onCancel}
                className="text-[var(--app-hint)] hover:text-[var(--app-fg)] p-0.5"
                title="Cancel"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
        </div>
    )
}

interface DirectoryNodeProps {
    api: ApiClient | null
    sessionId: string
    path: string
    label: string
    depth: number
    onOpenFile: (path: string) => void
    onDownloadFile?: (path: string, fileName: string) => void
    onUploadFile?: (directoryPath: string, file: File) => void | Promise<void>
    onCreateFolder?: (parentPath: string, name: string) => void
    expanded: Set<string>
    onToggle: (path: string) => void
    downloadingPath?: string | null
    creatingInPath?: string | null
    onSetCreatingInPath?: (path: string | null) => void
}

function DirectoryNode(props: DirectoryNodeProps) {
    const isExpanded = props.expanded.has(props.path)
    const { entries, error, isLoading } = useSessionDirectory(props.api, props.sessionId, props.path, {
        enabled: isExpanded
    })
    const fileInputRef = useRef<HTMLInputElement>(null)

    const directories = useMemo(() => entries.filter((entry) => entry.type === 'directory'), [entries])
    const files = useMemo(() => entries.filter((entry) => entry.type === 'file'), [entries])
    const childDepth = props.depth + 1

    const indent = 12 + props.depth * 14
    const childIndent = 12 + childDepth * 14

    const isCreatingHere = props.creatingInPath === props.path

    const handleUploadClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        fileInputRef.current?.click()
    }

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && props.onUploadFile) {
            props.onUploadFile(props.path, file)
        }
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleNewFolderClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!isExpanded) props.onToggle(props.path)
        props.onSetCreatingInPath?.(props.path)
    }

    return (
        <div>
            <div className="group flex w-full items-center">
                <button
                    type="button"
                    onClick={() => props.onToggle(props.path)}
                    className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)] transition-colors"
                    style={{ paddingLeft: indent }}
                >
                    <ChevronIcon collapsed={!isExpanded} className="text-[var(--app-hint)]" />
                    <FolderIcon className="text-[var(--app-link)]" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{props.label}</div>
                    </div>
                </button>
                <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {props.onCreateFolder ? (
                        <button
                            type="button"
                            onClick={handleNewFolderClick}
                            className="p-1 rounded text-[var(--app-hint)] hover:text-[var(--app-link)] hover:bg-[var(--app-subtle-bg)]"
                            title="New folder"
                        >
                            <FolderPlusIcon />
                        </button>
                    ) : null}
                    {props.onUploadFile ? (
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            className="p-1 rounded text-[var(--app-hint)] hover:text-[var(--app-link)] hover:bg-[var(--app-subtle-bg)]"
                            title="Upload file"
                        >
                            <UploadIcon />
                        </button>
                    ) : null}
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelected}
            />

            {isExpanded ? (
                isLoading ? (
                    <DirectorySkeleton depth={childDepth} />
                ) : error ? (
                    <DirectoryErrorRow depth={childDepth} message={error} />
                ) : (
                    <div>
                        {isCreatingHere ? (
                            <NewFolderInput
                                depth={childDepth}
                                onConfirm={(name) => {
                                    props.onCreateFolder?.(props.path, name)
                                    props.onSetCreatingInPath?.(null)
                                }}
                                onCancel={() => props.onSetCreatingInPath?.(null)}
                            />
                        ) : null}

                        {directories.map((entry) => {
                            const childPath = props.path ? `${props.path}/${entry.name}` : entry.name
                            return (
                                <DirectoryNode
                                    key={childPath}
                                    api={props.api}
                                    sessionId={props.sessionId}
                                    path={childPath}
                                    label={entry.name}
                                    depth={childDepth}
                                    onOpenFile={props.onOpenFile}
                                    onDownloadFile={props.onDownloadFile}
                                    onUploadFile={props.onUploadFile}
                                    onCreateFolder={props.onCreateFolder}
                                    expanded={props.expanded}
                                    onToggle={props.onToggle}
                                    downloadingPath={props.downloadingPath}
                                    creatingInPath={props.creatingInPath}
                                    onSetCreatingInPath={props.onSetCreatingInPath}
                                />
                            )
                        })}

                        {files.map((entry) => {
                            const filePath = props.path ? `${props.path}/${entry.name}` : entry.name
                            const isDownloading = props.downloadingPath === filePath
                            return (
                                <div key={filePath} className="group flex w-full items-center">
                                    <button
                                        type="button"
                                        onClick={() => props.onOpenFile(filePath)}
                                        className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)] transition-colors"
                                        style={{ paddingLeft: childIndent }}
                                    >
                                        <span className="h-4 w-4" />
                                        <FileIcon fileName={entry.name} size={22} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{entry.name}</div>
                                        </div>
                                    </button>
                                    {props.onDownloadFile ? (
                                        <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    props.onDownloadFile?.(filePath, entry.name)
                                                }}
                                                disabled={isDownloading}
                                                className="p-1 rounded text-[var(--app-hint)] hover:text-[var(--app-link)] hover:bg-[var(--app-subtle-bg)] disabled:opacity-50"
                                                title="Download"
                                            >
                                                {isDownloading ? <SpinnerIcon /> : <DownloadIcon />}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            )
                        })}

                        {directories.length === 0 && files.length === 0 && !isCreatingHere ? (
                            <div
                                className="px-3 py-2 text-sm text-[var(--app-hint)]"
                                style={{ paddingLeft: childIndent }}
                            >
                                Empty directory.
                            </div>
                        ) : null}
                    </div>
                )
            ) : null}
        </div>
    )
}

export function DirectoryTree(props: {
    api: ApiClient | null
    sessionId: string
    rootLabel: string
    onOpenFile: (path: string) => void
    onDownloadFile?: (path: string, fileName: string) => void
    onUploadFile?: (directoryPath: string, file: File) => void | Promise<void>
    onCreateFolder?: (parentPath: string, name: string) => void
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
    const [downloadingPath, setDownloadingPath] = useState<string | null>(null)
    const [creatingInPath, setCreatingInPath] = useState<string | null>(null)

    const handleToggle = useCallback((path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(path)) {
                next.delete(path)
            } else {
                next.add(path)
            }
            return next
        })
    }, [])

    const handleDownloadFile = useCallback(async (path: string, fileName: string) => {
        if (!props.onDownloadFile) return
        setDownloadingPath(path)
        try {
            await props.onDownloadFile(path, fileName)
        } finally {
            setDownloadingPath(null)
        }
    }, [props.onDownloadFile])

    return (
        <div className="border-t border-[var(--app-divider)]">
            <DirectoryNode
                api={props.api}
                sessionId={props.sessionId}
                path=""
                label={props.rootLabel}
                depth={0}
                onOpenFile={props.onOpenFile}
                onDownloadFile={props.onDownloadFile ? handleDownloadFile : undefined}
                onUploadFile={props.onUploadFile}
                onCreateFolder={props.onCreateFolder}
                expanded={expanded}
                onToggle={handleToggle}
                downloadingPath={downloadingPath}
                creatingInPath={creatingInPath}
                onSetCreatingInPath={setCreatingInPath}
            />
        </div>
    )
}
