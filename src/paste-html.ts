// Paste rich text as Markdown. When someone copies from a web page, Google Docs, Notion, Word or an
// email, the clipboard carries HTML; we turn its structure (headings, bold, links, lists, quotes,
// code, tables) into Markdown and drop the styling.
//
// Safety: the HTML is parsed by DOMPurify into a detached fragment (through its own Trusted Types
// policy) and only read from there. Nothing is inserted into the page and no script can run.
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

let service: TurndownService | null = null
function turndown() {
  if (service) return service
  service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })
  service.use(gfm)
  // Images: keep real web images; drop pasted data: blobs (Word/Docs inline images) that would
  // bloat the post with megabytes of base64.
  service.addRule('safeImages', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLImageElement
      const src = el.getAttribute('src') ?? ''
      if (!/^https?:\/\//i.test(src)) return ''
      const alt = (el.getAttribute('alt') ?? '').replace(/[[\]]/g, '')
      return `![${alt}](${src})`
    },
  })
  // Links with no usable href become plain text.
  service.addRule('plainLinks', {
    filter: (node) => node.nodeName === 'A' && !/^(https?:|mailto:|\/|#)/i.test(node.getAttribute('href') ?? ''),
    replacement: (content) => content,
  })
  // "- item" rather than Turndown's padded "-   item"
  service.addRule('tightListItems', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null
      let prefix = options.bulletListMarker + ' '
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1)
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n' + ' '.repeat(prefix.length))
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    },
  })
  service.addRule('strike', { filter: ['del', 's', 'strike'] as (keyof HTMLElementTagNameMap)[], replacement: (content) => `~~${content}~~` })
  service.remove(['style', 'script', 'noscript', 'meta', 'link', 'title', 'head', 'button', 'form', 'input', 'select', 'textarea'])
  return service
}

const FORMATTING = 'h1,h2,h3,h4,h5,h6,strong,b,em,i,a[href],ul,ol,li,blockquote,pre,code,table,hr,img,del,s,strike,u,sup,sub'
const MONO = /monospace|menlo|monaco|consolas|courier|sf mono|jetbrains|fira code|source code/i

/** Google Docs (and some editors) express bold/italic/strike as inline styles on spans. */
function styleToTags(root: Element) {
  for (const el of root.querySelectorAll<HTMLElement>('span[style], b[style]')) {
    const s = el.getAttribute('style') ?? ''
    // Docs wraps the whole selection in <b style="font-weight:normal" id="docs-internal-guid-…">
    if (el.tagName === 'B' && /font-weight:\s*(normal|400)/i.test(s)) {
      el.replaceWith(...el.childNodes)
      continue
    }
    if (el.tagName !== 'SPAN') continue
    const wrap = (tag: string) => {
      const w = el.ownerDocument.createElement(tag)
      while (el.firstChild) w.appendChild(el.firstChild)
      el.appendChild(w)
    }
    if (/font-weight:\s*(bold|[6-9]00)/i.test(s)) wrap('strong')
    if (/font-style:\s*italic/i.test(s)) wrap('em')
    if (/text-decoration[^;]*line-through/i.test(s)) wrap('del')
  }
}

/**
 * Markdown for the pasted HTML, or null when the paste should stay plain text: no rich formatting
 * at all, or content copied from a code editor (VS Code etc. copy coloured monospace HTML).
 */
export function htmlToMarkdown(html: string): string | null {
  if (!html || html.length > 2_000_000) return null
  const body = DOMPurify.sanitize(html, {
    RETURN_DOM: true,
    FORBID_TAGS: ['style', 'script', 'meta', 'link', 'title', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea'],
    KEEP_CONTENT: true,
  }) as HTMLElement

  // Copied from a code editor or terminal: paste the plain text instead.
  const styled = body.querySelector<HTMLElement>('[style]')
  if (styled && MONO.test(styled.getAttribute('style') ?? '') && !body.querySelector('h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote')) return null

  styleToTags(body)
  if (!body.querySelector(FORMATTING)) return null

  const md = turndown()
    .turndown(body)
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return md || null
}
