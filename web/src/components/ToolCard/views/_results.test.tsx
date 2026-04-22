import { describe, expect, it } from 'vitest'
import { extractTextFromResult, getMutationResultRenderMode, getToolResultViewComponent, extractImageFromContentBlock, extractImagesFromResult } from '@/components/ToolCard/views/_results'

describe('extractTextFromResult', () => {
    it('returns string directly', () => {
        expect(extractTextFromResult('hello')).toBe('hello')
    })

    it('extracts text from content block array', () => {
        const result = [{ type: 'text', text: 'File created successfully' }]
        expect(extractTextFromResult(result)).toBe('File created successfully')
    })

    it('joins multiple content blocks', () => {
        const result = [
            { type: 'text', text: 'Line 1' },
            { type: 'text', text: 'Line 2' }
        ]
        expect(extractTextFromResult(result)).toBe('Line 1\nLine 2')
    })

    it('extracts from object with content field', () => {
        expect(extractTextFromResult({ content: 'done' })).toBe('done')
    })

    it('extracts from object with text field', () => {
        expect(extractTextFromResult({ text: 'done' })).toBe('done')
    })

    it('extracts from object with output field', () => {
        expect(extractTextFromResult({ output: 'ok' })).toBe('ok')
    })

    it('extracts from object with error field', () => {
        expect(extractTextFromResult({ error: 'not found' })).toBe('not found')
    })

    it('returns null for null/undefined', () => {
        expect(extractTextFromResult(null)).toBeNull()
        expect(extractTextFromResult(undefined)).toBeNull()
    })

    it('strips tool_use_error tags', () => {
        const result = '<tool_use_error>Permission denied</tool_use_error>'
        expect(extractTextFromResult(result)).toBe('Permission denied')
    })
})

describe('getMutationResultRenderMode', () => {
    it('uses auto mode for short single-line success messages', () => {
        const result = getMutationResultRenderMode('Successfully wrote to /path/file.ts', 'completed')
        expect(result.mode).toBe('auto')
        expect(result.language).toBeUndefined()
    })

    it('uses auto mode for 3 lines or fewer', () => {
        const text = 'Line 1\nLine 2\nLine 3'
        const result = getMutationResultRenderMode(text, 'completed')
        expect(result.mode).toBe('auto')
    })

    it('uses code mode for multiline content (>3 lines) to avoid markdown mis-parsing', () => {
        const bashScript = '#!/bin/bash\n# Batch download\nset -e\ndownload() {\n  echo "downloading"\n}'
        const result = getMutationResultRenderMode(bashScript, 'completed')
        expect(result.mode).toBe('code')
        expect(result.language).toBe('text')
    })

    it('uses code mode for error state regardless of line count', () => {
        const result = getMutationResultRenderMode('Error: file not found', 'error')
        expect(result.mode).toBe('code')
        expect(result.language).toBe('text')
    })

    it('uses code mode for multiline error', () => {
        const text = 'Error\nStack trace:\n  at foo\n  at bar\n  at baz'
        const result = getMutationResultRenderMode(text, 'error')
        expect(result.mode).toBe('code')
    })
})

describe('getToolResultViewComponent registry', () => {
    it('uses the same view for Write, Edit, MultiEdit, NotebookEdit', () => {
        const writeView = getToolResultViewComponent('Write')
        const editView = getToolResultViewComponent('Edit')
        const multiEditView = getToolResultViewComponent('MultiEdit')
        const notebookEditView = getToolResultViewComponent('NotebookEdit')
        expect(writeView).toBe(editView)
        expect(editView).toBe(multiEditView)
        expect(multiEditView).toBe(notebookEditView)
    })

    it('returns GenericResultView for mcp__ prefixed tools', () => {
        const mcpView = getToolResultViewComponent('mcp__test__tool')
        const unknownView = getToolResultViewComponent('SomeUnknownTool')
        // Both should fall back to GenericResultView
        expect(mcpView).toBe(unknownView)
    })
})

describe('extractImageFromContentBlock', () => {
    it('extracts base64 image block', () => {
        const block = {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' }
        }
        const result = extractImageFromContentBlock(block)
        expect(result).toEqual({
            mediaType: 'image/png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgo='
        })
    })

    it('returns null for text blocks', () => {
        expect(extractImageFromContentBlock({ type: 'text', text: 'hello' })).toBeNull()
    })

    it('returns null for non-object input', () => {
        expect(extractImageFromContentBlock('string')).toBeNull()
        expect(extractImageFromContentBlock(null)).toBeNull()
        expect(extractImageFromContentBlock(undefined)).toBeNull()
        expect(extractImageFromContentBlock(42)).toBeNull()
    })

    it('returns null for image block without source', () => {
        expect(extractImageFromContentBlock({ type: 'image' })).toBeNull()
    })

    it('returns null for image block with non-base64 source type', () => {
        const block = {
            type: 'image',
            source: { type: 'url', url: 'https://example.com/img.png' }
        }
        expect(extractImageFromContentBlock(block)).toBeNull()
    })

    it('returns null when source fields are wrong types', () => {
        expect(extractImageFromContentBlock({
            type: 'image',
            source: { type: 'base64', media_type: 123, data: 'abc' }
        })).toBeNull()
        expect(extractImageFromContentBlock({
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 123 }
        })).toBeNull()
    })

    it('handles jpeg media type', () => {
        const block = {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ=' }
        }
        const result = extractImageFromContentBlock(block)
        expect(result).toEqual({
            mediaType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,/9j/4AAQ='
        })
    })
})

describe('extractImagesFromResult', () => {
    const pngBlock = {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'AAAA' }
    }
    const textBlock = { type: 'text', text: 'some text' }

    it('extracts images from content block array', () => {
        const result = [textBlock, pngBlock]
        const images = extractImagesFromResult(result)
        expect(images).toHaveLength(1)
        expect(images[0].mediaType).toBe('image/png')
    })

    it('extracts images from object with content array', () => {
        const result = { content: [textBlock, pngBlock] }
        const images = extractImagesFromResult(result)
        expect(images).toHaveLength(1)
    })

    it('extracts multiple images', () => {
        const jpgBlock = {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' }
        }
        const images = extractImagesFromResult([pngBlock, textBlock, jpgBlock])
        expect(images).toHaveLength(2)
        expect(images[0].mediaType).toBe('image/png')
        expect(images[1].mediaType).toBe('image/jpeg')
    })

    it('returns empty array for null/undefined', () => {
        expect(extractImagesFromResult(null)).toEqual([])
        expect(extractImagesFromResult(undefined)).toEqual([])
    })

    it('returns empty array for plain string', () => {
        expect(extractImagesFromResult('hello')).toEqual([])
    })

    it('returns empty array when no image blocks exist', () => {
        expect(extractImagesFromResult([textBlock])).toEqual([])
        expect(extractImagesFromResult({ content: [textBlock] })).toEqual([])
    })

    it('returns empty array for object without content array', () => {
        expect(extractImagesFromResult({ text: 'hello' })).toEqual([])
        expect(extractImagesFromResult({ content: 'string' })).toEqual([])
    })
})
