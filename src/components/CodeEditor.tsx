import { useEffect, useRef } from 'react'
import { EditorState, EditorSelection, Compartment, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { languages } from '@codemirror/language-data'
import { htmlToMarkdown } from '../paste-html'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'

// ---------- formatting commands (used by the toolbar and keyboard shortcuts) ----------
export function wrapSelection(view: EditorView, before: string, after = before, placeholderText = 'text') {
  const changes = view.state.changeByRange((range) => {
    const selected = view.state.sliceDoc(range.from, range.to)
    // Toggle off if already wrapped
    const pre = view.state.sliceDoc(range.from - before.length, range.from)
    const post = view.state.sliceDoc(range.to, range.to + after.length)
    if (selected && pre === before && post === after) {
      return {
        changes: [
          { from: range.from - before.length, to: range.from, insert: '' },
          { from: range.to, to: range.to + after.length, insert: '' },
        ],
        range: EditorSelection.range(range.from - before.length, range.to - before.length),
      }
    }
    const text = selected || placeholderText
    return {
      changes: { from: range.from, to: range.to, insert: before + text + after },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
    }
  })
  view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
  view.focus()
  return true
}

export function toggleLinePrefix(view: EditorView, prefix: string) {
  const { state } = view
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let l = state.doc.lineAt(r.from).number; l <= state.doc.lineAt(r.to).number; l++) lines.add(l)
  }
  const all = [...lines].map((n) => state.doc.line(n))
  const isHeading = /^#+ $/.test(prefix)
  const allHave = all.every((l) => l.text.startsWith(prefix))
  const changes = all.map((l, i) => {
    const p = prefix === '1. ' ? `${i + 1}. ` : prefix
    if (allHave) return { from: l.from, to: l.from + prefix.length, insert: '' }
    // Replace an existing heading marker instead of stacking them
    const existing = isHeading ? (l.text.match(/^#+ /)?.[0] ?? '') : ''
    return { from: l.from, to: l.from + existing.length, insert: p }
  })
  view.dispatch({ changes, userEvent: 'input' })
  view.focus()
  return true
}

export function insertText(view: EditorView, text: string, selectOffset?: [number, number]) {
  const r = view.state.selection.main
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: text },
    selection: selectOffset
      ? EditorSelection.range(r.from + selectOffset[0], r.from + selectOffset[1])
      : EditorSelection.cursor(r.from + text.length),
    scrollIntoView: true,
    userEvent: 'input',
  })
  view.focus()
}

/** A 2×2 Markdown table on its own lines, with the first header cell selected so you can type over it. */
export function insertTable(view: EditorView) {
  const r = view.state.selection.main
  const line = view.state.doc.lineAt(r.from)
  const before = r.from === line.from ? (line.number > 1 && view.state.doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n'
  const table = '| Column | Column |\n| --- | --- |\n| Cell | Cell |\n'
  const text = before + table + '\n'
  const start = before.length + 2
  insertText(view, text, [start, start + 'Column'.length])
}

export function insertLink(view: EditorView) {
  const r = view.state.selection.main
  const sel = view.state.sliceDoc(r.from, r.to)
  if (/^https?:\/\//.test(sel)) {
    insertText(view, `[text](${sel})`, [1, 5])
  } else {
    const label = sel || 'text'
    insertText(view, `[${label}](https://)`, [label.length + 3, label.length + 11])
  }
  return true
}

// ---------- theme ----------
const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--editor-font-size, 16px)', backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--font-editor)', lineHeight: '1.75', overflow: 'auto' },
  '.cm-content': { padding: '8px 0 40vh', caretColor: 'var(--text)', maxWidth: 'var(--editor-measure, 68ch)', margin: '0 auto' },
  '.cm-line': { padding: '0 32px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--text)', borderLeftWidth: '1.5px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-placeholder': { color: 'var(--text-3)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-panels input, .cm-panels button': { fontSize: '13px' },
  '.cm-matchingBracket': { backgroundColor: 'var(--selection-match)', outline: 'none' },
})

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '650', fontSize: '1.4em' },
  { tag: t.heading2, fontWeight: '650', fontSize: '1.2em' },
  { tag: t.heading3, fontWeight: '650', fontSize: '1.08em' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '650' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-3)' },
  { tag: [t.link, t.url], color: 'var(--text-3)' },
  { tag: t.quote, color: 'var(--text-2)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--text-3)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', color: 'var(--syntax-code)' },
  { tag: [t.keyword, t.operator], color: 'var(--syntax-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.atom], color: 'var(--syntax-number)' },
  { tag: [t.comment], color: 'var(--text-3)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--syntax-prop)' },
  { tag: [t.className, t.typeName, t.tagName], color: 'var(--syntax-tag)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--text)' },
])

// ---------- component ----------
export type UploadFn = (file: File) => Promise<{ url: string; name: string; type: string }>

interface Props {
  value: string
  onChange: (v: string) => void
  language?: 'markdown' | 'css' | 'plain'
  placeholder?: string
  onUpload?: UploadFn
  onReady?: (view: EditorView) => void
  onScrollRatio?: (ratio: number) => void
  onLinkRequest?: () => void
  className?: string
  monospace?: boolean
}

/** Escape text placed inside Markdown link/image brackets. */
export const mdText = (s: string) => s.replace(/[\\[\]<>]/g, '\\$&')
/** Escape a URL placed in Markdown parentheses or an HTML attribute. */
export const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u.replace(/[\s"'<>()]/g, (c) => encodeURIComponent(c)) : '')

export function mediaMarkdown(m: { url: string; name: string; type: string }) {
  const alt = mdText(m.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '))
  const url = safeUrl(m.url)
  if (m.type === 'image' || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(m.url)) return `![${alt}](${url})`
  if (m.type === 'video') return `<video src="${url}" controls></video>`
  if (m.type === 'audio') return `<audio src="${url}" controls></audio>`
  return `[${mdText(m.name)}](${url})`
}

export function CodeEditor({ value, onChange, language = 'markdown', placeholder, onUpload, onReady, onScrollRatio, onLinkRequest, className, monospace }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cbs = useRef({ onChange, onUpload, onScrollRatio, onLinkRequest })
  cbs.current = { onChange, onUpload, onScrollRatio, onLinkRequest }
  const uploadComp = useRef(new Compartment())

  useEffect(() => {
    const uploadFiles = async (v: EditorView, files: File[], pos: number) => {
      const upload = cbs.current.onUpload
      if (!upload) return
      for (const file of files) {
        const marker = `![Uploading ${file.name}…]()`
        v.dispatch({ changes: { from: pos, insert: marker + '\n' }, userEvent: 'input' })
        let replacement = ''
        try {
          replacement = mediaMarkdown(await upload(file))
        } catch {
          replacement = ''
        }
        const doc = v.state.doc.toString()
        const at = doc.indexOf(marker)
        if (at >= 0) {
          const end = at + marker.length + (replacement ? 0 : 1)
          v.dispatch({ changes: { from: at, to: end, insert: replacement }, userEvent: 'input' })
        }
        pos = Math.min(pos + replacement.length + 1, v.state.doc.length)
      }
    }

    // ⌘⇧V / Ctrl+Shift+V pastes plain text: remember the shortcut for the paste event that follows.
    let plainNext = false
    const fileHandlers = EditorView.domEventHandlers({
      keydown(e) {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
          plainNext = true
          setTimeout(() => (plainNext = false), 500)
        }
        return false
      },
      paste(e, v) {
        const files = [...(e.clipboardData?.files ?? [])]
        if (files.length && cbs.current.onUpload) {
          e.preventDefault()
          uploadFiles(v, files, v.state.selection.main.from)
          return true
        }
        // Rich text (web pages, Docs, Notion, Word…) becomes Markdown in Markdown editors.
        const plain = plainNext
        plainNext = false
        const html = e.clipboardData?.getData('text/html')
        if (plain || language !== 'markdown' || !html) return false
        const md = htmlToMarkdown(html)
        if (md === null) return false
        e.preventDefault()
        const { from, to } = v.state.selection.main
        v.dispatch({ changes: { from, to, insert: md }, selection: { anchor: from + md.length }, userEvent: 'input.paste', scrollIntoView: true })
        return true
      },
      drop(e, v) {
        const files = [...(e.dataTransfer?.files ?? [])]
        if (!files.length || !cbs.current.onUpload) return false
        e.preventDefault()
        const pos = v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.selection.main.from
        uploadFiles(v, files, pos)
        return true
      },
      scroll(_e, v) {
        const s = v.scrollDOM
        const max = s.scrollHeight - s.clientHeight
        cbs.current.onScrollRatio?.(max > 0 ? s.scrollTop / max : 0)
        return false
      },
    })

    const lang: Extension =
      language === 'markdown' ? markdown({ base: markdownLanguage, codeLanguages: languages }) : language === 'css' ? css() : []

    const mdKeys =
      language === 'markdown'
        ? keymap.of([
            { key: 'Mod-b', run: (v) => wrapSelection(v, '**') },
            { key: 'Mod-i', run: (v) => wrapSelection(v, '*') },
            { key: 'Mod-k', run: (v) => (cbs.current.onLinkRequest ? (cbs.current.onLinkRequest(), true) : insertLink(v)) },
            { key: 'Mod-e', run: (v) => wrapSelection(v, '`', '`', 'code') },
            { key: 'Mod-Shift-x', run: (v) => wrapSelection(v, '~~') },
          ])
        : []

    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          mdKeys,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
          lang,
          syntaxHighlighting(highlight),
          theme,
          placeholder ? cmPlaceholder(placeholder) : [],
          uploadComp.current.of(fileHandlers),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cbs.current.onChange(u.state.doc.toString())
          }),
          EditorView.contentAttributes.of({ spellcheck: language === 'markdown' ? 'true' : 'false', autocorrect: 'on' }),
        ],
      }),
    })
    view.current = v
    onReady?.(v)
    return () => {
      v.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  // Sync external value changes (e.g. restoring a revision) into the editor.
  useEffect(() => {
    const v = view.current
    const next = value.replace(/\r\n?/g, '\n')
    if (v && v.state.doc.toString() !== next) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } })
    }
  }, [value])

  return <div ref={host} className={`code-editor ${monospace ? 'mono' : ''} ${className ?? ''}`} />
}
