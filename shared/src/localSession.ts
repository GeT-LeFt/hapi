export interface LocalSession {
    sessionId: string
    projectPath: string
    projectId: string
    lastModified: number
    fileSize: number
    preview?: string
    isImported?: boolean
}
