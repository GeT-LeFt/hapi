type ViewTransition = {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
    skipTransition: () => void
}

type DocumentWithVT = Document & {
    startViewTransition?: (cb: () => void) => ViewTransition
}

export function startViewNav(direction: 'forward' | 'back', update: () => void) {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        update()
        return
    }
    const doc = document as DocumentWithVT
    if (typeof doc.startViewTransition !== 'function') {
        update()
        return
    }
    if (window.matchMedia('(min-width: 1024px)').matches) {
        update()
        return
    }
    document.documentElement.dataset.vtDir = direction
    const vt = doc.startViewTransition(() => update())
    vt.finished.finally(() => {
        if (document.documentElement.dataset.vtDir === direction) {
            delete document.documentElement.dataset.vtDir
        }
    })
}
