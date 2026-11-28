// Social (meta) image generator: draws a 1200×630 card with the post title and a byline on a canvas,
// entirely in the browser. The idea comes from Robert Birming's Bear dashboard plugin
// (robertbirming.com/bear-blog-meta-image-generator); this is Beardash's own implementation.
//
// The style is per blog and lives in this browser only (localStorage), like other Beardash preferences.

export interface MetaImageStyle {
  name: string
  subline: string
  /** An https URL, read with CORS (Bear's media CDN allows it). */
  avatar: string
  avatarShape: 'square' | 'circle'
  format: ImageFormat
  /** Draw the post's description under the title. */
  showDescription: boolean
  background: string
  text: string
  font: string
}

export type ImageFormat = 'png' | 'jpeg' | 'webp'
export const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]
// Lossy formats at a quality where text edges stay clean.
const QUALITY = 0.9
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export const FONTS: { label: string; value: string }[] = [
  { label: 'System sans', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'ui-monospace, Menlo, Consolas, monospace' },
]

export const W = 1200
export const H = 630
const PAD_X = 84
const PAD_Y = 76
const TITLE_SIZE = 76
const TITLE_LINE = 86
const TITLE_MAX_LINES = 3
// With a description, the title gets two lines and the description two, so both clear the byline.
const TITLE_LINES_WITH_DESC = 2
const DESC_SIZE = 32
const DESC_LINE = 44
const DESC_GAP = 62 // title baseline → first description baseline
const DESC_MAX_LINES = 2
const AVATAR = 80
const AVATAR_GAP = 22

const storeKey = (subdomain: string) => `beardash-og:${subdomain}`

export function defaultStyle(blogTitle: string, subdomain: string): MetaImageStyle {
  return {
    name: blogTitle || subdomain,
    subline: `${subdomain}.bearblog.dev`,
    avatar: '',
    avatarShape: 'square',
    format: 'png',
    showDescription: false,
    background: '#ffffff',
    text: '#222222',
    font: FONTS[0].value,
  }
}

export function loadStyle(subdomain: string, blogTitle: string): MetaImageStyle {
  const base = defaultStyle(blogTitle, subdomain)
  try {
    const raw = localStorage.getItem(storeKey(subdomain))
    if (!raw) return base
    const s = JSON.parse(raw) as Partial<MetaImageStyle>
    return {
      name: typeof s.name === 'string' ? s.name : base.name,
      subline: typeof s.subline === 'string' ? s.subline : base.subline,
      avatar: typeof s.avatar === 'string' && /^https:\/\//i.test(s.avatar) ? s.avatar : '',
      avatarShape: s.avatarShape === 'circle' ? 'circle' : 'square',
      format: FORMATS.some((f) => f.value === s.format) ? s.format! : base.format,
      showDescription: s.showDescription === true,
      background: normHex(s.background) ?? base.background,
      text: normHex(s.text) ?? base.text,
      font: FONTS.some((f) => f.value === s.font) ? s.font! : base.font,
    }
  } catch {
    return base
  }
}

export function saveStyle(subdomain: string, style: MetaImageStyle) {
  try {
    localStorage.setItem(storeKey(subdomain), JSON.stringify(style))
  } catch {
    /* private mode or full storage: the style just won't persist */
  }
}

/** "#abc" or "abc" → "#aabbcc"; anything else → null. */
export function normHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(m)) return `#${[...m].map((c) => c + c).join('')}`.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(m)) return `#${m}`.toLowerCase()
  return null
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const [r, g, bl] = pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t)))
  return `rgb(${r}, ${g}, ${bl})`
}

/** Shortens one line with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s.trimEnd()}…`).width > max) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Greedy word wrap, capped at `maxLines`; the last line gets an ellipsis if text was cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  let i = 0
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (!line || ctx.measureText(next).width <= max) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines) break
  }
  const cut = lines.length === maxLines && i < words.length
  if (!cut && line) lines.push(line)
  if (cut) {
    // Drop whole words from the last line until the ellipsis fits after it.
    let last = lines[maxLines - 1]
    while (last.includes(' ') && ctx.measureText(`${last}…`).width > max) last = last.slice(0, last.lastIndexOf(' '))
    lines[maxLines - 1] = `${last.replace(/[\s,.;:!?–—-]+$/, '')}…`
  }
  return { lines: lines.map((l) => fit(ctx, l, max)), cut }
}

/** Like CSS text-wrap: balance — the narrowest width that keeps the same number of lines. */
function balanced(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number) {
  const first = wrap(ctx, text, max, maxLines)
  if (first.lines.length < 2 || first.cut) return first.lines
  let lo = max / first.lines.length
  let hi = max
  let best = first.lines
  while (hi - lo > 4) {
    const mid = (lo + hi) / 2
    const r = wrap(ctx, text, mid, maxLines)
    if (r.lines.length === first.lines.length && !r.cut && !r.lines.some((l) => l.endsWith('…'))) {
      best = r.lines
      hi = mid
    } else lo = mid
  }
  return best
}

// Loaded with CORS so the canvas stays exportable. A site that doesn't allow it fails to load
// (instead of tainting the canvas), and the card is drawn without the avatar.
const images = new Map<string, Promise<HTMLImageElement | null>>()
export function loadImage(src: string) {
  src = src.trim()
  if (!/^(https:\/\/|data:image\/|blob:)/i.test(src)) return Promise.resolve(null)
  let p = images.get(src)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    })
    if (images.size > 20) images.clear()
    images.set(src, p)
  }
  return p
}

export async function drawMetaImage(canvas: HTMLCanvasElement, title: string, style: MetaImageStyle, description = '') {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const bg = normHex(style.background) ?? '#ffffff'
  const fg = normHex(style.text) ?? '#222222'
  const font = style.font || FONTS[0].value

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  ctx.imageSmoothingQuality = 'high'

  // Title
  ctx.fillStyle = fg
  ctx.font = `700 ${TITLE_SIZE}px ${font}`
  const desc = style.showDescription ? description.replace(/\s+/g, ' ').trim() : ''
  const lines = balanced(ctx, title.trim() || 'Untitled', W - PAD_X * 2, desc ? TITLE_LINES_WITH_DESC : TITLE_MAX_LINES)
  // First baseline sits a little over one line-height below the top padding.
  const titleBase = (i: number) => PAD_Y + 132 + i * TITLE_LINE
  lines.forEach((l, i) => ctx.fillText(l, PAD_X, titleBase(i)))

  // Description: smaller and muted, under the title
  if (desc) {
    ctx.fillStyle = mix(fg, bg, 0.7)
    ctx.font = `400 ${DESC_SIZE}px ${font}`
    const start = titleBase(lines.length - 1) + DESC_GAP
    wrap(ctx, desc, W - PAD_X * 2, DESC_MAX_LINES).lines.forEach((l, i) => ctx.fillText(l, PAD_X, start + i * DESC_LINE))
  }

  // Byline: avatar, name, subline along the bottom
  const top = H - PAD_Y - AVATAR
  let x = PAD_X
  const avatar = await loadImage(style.avatar)
  if (avatar) {
    const side = Math.min(avatar.naturalWidth, avatar.naturalHeight)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, top, AVATAR, AVATAR, style.avatarShape === 'circle' ? AVATAR / 2 : 8)
    ctx.clip()
    ctx.drawImage(avatar, (avatar.naturalWidth - side) / 2, (avatar.naturalHeight - side) / 2, side, side, x, top, AVATAR, AVATAR)
    ctx.restore()
    x += AVATAR + AVATAR_GAP
  }
  const room = W - PAD_X - x
  const name = style.name.trim()
  const sub = style.subline.trim()
  if (name) {
    ctx.fillStyle = fg
    ctx.font = `600 32px ${font}`
    ctx.fillText(fit(ctx, name, room), x, sub ? top + 36 : top + 52)
  }
  if (sub) {
    ctx.fillStyle = mix(fg, bg, 0.65)
    ctx.font = `400 26px ${font}`
    ctx.fillText(fit(ctx, sub, room), x, name ? top + 70 : top + 52)
  }
}

/** Exports the canvas as `<base>.<ext>`. Browsers that can't encode WebP (older Safari) fall back to PNG. */
export function canvasToFile(canvas: HTMLCanvasElement, base: string, format: ImageFormat = 'png') {
  const type = `image/${format}`
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(new File([b], `${base}.${EXT[b.type] ?? 'png'}`, { type: b.type || 'image/png' })) : reject(new Error("Couldn't create the image"))),
      type,
      format === 'png' ? undefined : QUALITY,
    ),
  )
}

/** File name without extension, from the slug or title: "my-post-og". */
export function ogFileName(slug: string, title: string) {
  const base = (slug || title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${base || 'social-image'}-og`
}
