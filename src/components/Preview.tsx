import { forwardRef, useMemo } from 'react'
import { Marked } from 'marked'
import { sanitizeHtml } from '../sanitize'

const md = new Marked({ gfm: true, breaks: false })

export function renderMarkdown(src: string) {
  return sanitizeHtml(md.parse(src, { async: false }) as string)
}

export const Preview = forwardRef<HTMLDivElement, { title?: string; content: string; customCss?: string; className?: string }>(
  function Preview({ title, content, className }, ref) {
    const html = useMemo(() => renderMarkdown(content), [content])
    return (
      <div ref={ref} className={`preview ${className ?? ''}`}>
        <article className="prose">
          {title !== undefined && <h1 className="preview-title">{title || 'Untitled'}</h1>}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    )
  },
)

export function wordStats(text: string) {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~-]/g, ' ')
  const words = plain.trim() ? plain.trim().split(/\s+/).length : 0
  return { words, chars: text.length, minutes: Math.max(1, Math.round(words / 230)) }
}
