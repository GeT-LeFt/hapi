const MAX_DIMENSION = 2048
const INITIAL_QUALITY = 0.85
const FALLBACK_QUALITY = 0.75
const SKIP_THRESHOLD = 100 * 1024
const TARGET_SIZE = 1 * 1024 * 1024

const COMPRESSIBLE_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/bmp',
    'image/tiff', 'image/x-tiff', 'image/heic', 'image/heif'
])

export function isCompressibleImage(mimeType: string): boolean {
    return COMPRESSIBLE_TYPES.has(mimeType.toLowerCase())
}

export async function compressImage(file: File): Promise<File> {
    if (file.size <= SKIP_THRESHOLD) return file
    if (!isCompressibleImage(file.type)) return file

    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap

    let targetWidth = width
    let targetHeight = height
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height)
        targetWidth = Math.round(width * scale)
        targetHeight = Math.round(height * scale)
    }

    const canvas = new OffscreenCanvas(targetWidth, targetHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        bitmap.close()
        return file
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    bitmap.close()

    let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: INITIAL_QUALITY })

    if (blob.size > TARGET_SIZE) {
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: FALLBACK_QUALITY })
    }

    if (blob.size >= file.size) return file

    const ext = file.name.lastIndexOf('.')
    const baseName = ext > 0 ? file.name.slice(0, ext) : file.name
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
