import { useEffect, useRef, useState } from 'react'
import type { BlogInfo } from '../api'
import { Icon, Modal } from '../ui'
import { ConnectBlogForm, type Connected } from './ConnectBlogForm'

function hue(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

type Fav = { kind: 'image'; src: string } | { kind: 'text'; text: string } | null

/** Bear's favicon setting is either an image URL or an emoji/short text. */
export function parseFavicon(raw: string | null | undefined): Fav {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return null
  if (/^https:\/\//i.test(v) || /^\/\//.test(v) || /^data:image\//i.test(v)) return { kind: 'image', src: v.startsWith('//') ? 'https:' + v : v }
  // Accept up to a few characters (emoji can be several code units, e.g. flags or ZWJ sequences).
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v)]
  if (graphemes.length <= 2 && !/^https?:/i.test(v)) return { kind: 'text', text: v }
  return null
}

export function BlogAvatar({ blog, size = 28 }: { blog: BlogInfo; size?: number }) {
  const [broken, setBroken] = useState(false)
  const fav = parseFavicon(blog.favicon)
  useEffect(() => setBroken(false), [blog.favicon])
  const box = { width: size, height: size }

  if (fav?.kind === 'image' && !broken) {
    return (
      <span className="blog-avatar blog-avatar-img" style={box} aria-hidden>
        <img src={fav.src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />
      </span>
    )
  }
  if (fav?.kind === 'text') {
    return (
      <span className="blog-avatar blog-avatar-emoji" style={{ ...box, fontSize: size * 0.62 }} aria-hidden>
        {fav.text}
      </span>
    )
  }
  const name = typeof blog.blogTitle === 'string' && blog.blogTitle.trim() ? blog.blogTitle : blog.subdomain
  const letter = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className="blog-avatar" style={{ ['--h' as string]: hue(blog.subdomain), ...box, fontSize: size * 0.46 }} aria-hidden>
      {letter}
    </span>
  )
}

export function BlogSwitcher({
  blogs,
  current,
  onSwitch,
  onConnected,
  onRemove,
  addRequest,
  onAddRequestSeen,
}: {
  /** A subdomain to offer in the "Add a blog" modal (from the beardash.dev/<subdomain> shortcut). */
  addRequest?: string | null
  onAddRequestSeen?: () => void
  blogs: BlogInfo[]
  current: BlogInfo
  onSwitch: (subdomain: string) => void
  onConnected: (r: Connected) => void
  onRemove: (blog: BlogInfo) => void
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prefill, setPrefill] = useState<string | undefined>()
  useEffect(() => {
    if (!addRequest) return
    setPrefill(addRequest)
    setAdding(true)
    onAddRequestSeen?.()
  }, [addRequest, onAddRequestSeen])
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const els = [...(root.current?.querySelectorAll<HTMLElement>('.switcher-pop [data-nav]') ?? [])]
        const i = els.indexOf(document.activeElement as HTMLElement)
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    root.current?.querySelector<HTMLElement>('.switcher-item.on')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="switcher" ref={root}>
      <button
        ref={trigger}
        className={`switcher-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current blog: ${current.blogTitle || current.subdomain}. Switch blog`}
        title={`${current.blogTitle || current.subdomain} · ${current.subdomain}.bearblog.dev`}
      >
        <BlogAvatar blog={current} />
        <span className="switcher-text">
          <span className="switcher-title">{current.blogTitle || current.subdomain}</span>
          <span className="switcher-sub">{current.subdomain}.bearblog.dev</span>
        </span>
        <Icon name="chevronsUpDown" size={15} />
      </button>

      {open && (
        <div className="switcher-pop" role="menu">
          <div className="switcher-label">Blogs</div>
          {blogs.map((b) => {
            const on = b.subdomain === current.subdomain
            return (
              <div key={b.subdomain} className="switcher-row">
                <button
                  data-nav
                  role="menuitemradio"
                  aria-checked={on}
                  className={`switcher-item ${on ? 'on' : ''}`}
                  onClick={() => {
                    setOpen(false)
                    if (!on) onSwitch(b.subdomain)
                  }}
                >
                  <BlogAvatar blog={b} size={20} />
                  <span className="switcher-text" title={`${b.blogTitle || b.subdomain} · ${b.subdomain}.bearblog.dev`}>
                    <span className="switcher-title">{b.blogTitle || b.subdomain}</span>
                  </span>
                  {on && <Icon name="check" size={15} />}
                </button>
                <button
                  data-nav
                  className="switcher-remove"
                  title={`Disconnect ${b.blogTitle || b.subdomain}`}
                  aria-label={`Disconnect ${b.blogTitle || b.subdomain}`}
                  onClick={() => {
                    setOpen(false)
                    onRemove(b)
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            )
          })}
          <div className="menu-sep" />
          <button
            data-nav
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setPrefill(undefined)
              setAdding(true)
            }}
          >
            <Icon name="plus" size={15} /> Add a blog
          </button>
          <a data-nav role="menuitem" className="menu-item" href={`https://${current.subdomain}.bearblog.dev/`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} title={`${current.subdomain}.bearblog.dev`}>
            <Icon name="external" size={15} /> Open blog
          </a>
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => !busy && setAdding(false)}
        size="sm"
        title={prefill ? `Add ${prefill}.bearblog.dev?` : 'Add a blog'}
        initialFocus={prefill ? 'input[type=password]' : undefined}
        description={prefill ? 'Paste its API key to connect it alongside your other blogs.' : 'Connect another Bear Blog with its own API key.'}
        footer={
          <>
            <button className="btn" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="add-blog-form" disabled={busy}>
              {busy ? 'Checking key…' : 'Connect blog'}
            </button>
          </>
        }
      >
        {adding && (
          <ConnectBlogForm
            id="add-blog-form"
            showSubmit={false}
            onBusyChange={setBusy}
            initialSubdomain={prefill}
            onConnected={(r) => {
              setAdding(false)
              onConnected(r)
            }}
          />
        )}
      </Modal>
    </div>
  )
}
