import { useEffect, useRef, useState } from 'react'
import { fetchBlogPage } from '../api'
import { Icon } from '../ui'

// Previews the Theme CSS on a real page of the blog. The page is fetched through the Worker and shown in a
// sandboxed frame (public/theme-frame.html, no allow-same-origin) with the blog's own CSS and scripts removed,
// so only the CSS in the editor styles it. Edits apply live, before saving.

const FRAME_URL = import.meta.env.DEV ? '/theme-frame.html' : '/theme-frame'
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'

export function ThemePreview({ css, subdomain }: { css: string; subdomain: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const latestCss = useRef(css)
  latestCss.current = css
  const [path, setPath] = useState('/')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [phone, setPhone] = useState(false)
  // A new key reloads the frame for each page, so nothing carries over between pages.
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    setState('loading')
    let live = true
    const page = fetchBlogPage(path)
    page.catch(() => {}) // handled when the frame is ready; this just avoids an unhandled-rejection warning
    const onMessage = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const d = e.data
      if (d?.type === 'beardash:theme-ready') {
        try {
          const p = await page
          if (!live) return
          frame.current?.contentWindow?.postMessage({ type: 'beardash:theme-page', html: p.html, url: p.url, css: latestCss.current }, '*')
          setState('ready')
        } catch (err) {
          if (!live) return
          setError((err as Error).message)
          setState('error')
        }
      } else if (d?.type === 'beardash:theme-nav' && typeof d.path === 'string' && d.path.startsWith('/') && d.path.length < 512) {
        setPath(d.path)
        setFrameKey((k) => k + 1)
      }
    }
    addEventListener('message', onMessage)
    return () => {
      live = false
      removeEventListener('message', onMessage)
    }
  }, [path, frameKey])

  // Live CSS: swap the stylesheet in place, no reload.
  useEffect(() => {
    if (state !== 'ready') return
    const t = setTimeout(() => frame.current?.contentWindow?.postMessage({ type: 'beardash:theme-css', css }, '*'), 120)
    return () => clearTimeout(t)
  }, [css, state])

  const go = (p: string) => {
    setPath(p)
    setFrameKey((k) => k + 1)
  }

  return (
    <div className="theme-preview">
      <div className="editor-frame-bar theme-preview-bar">
        <span className="theme-preview-path muted small" title={`${subdomain}.bearblog.dev${path}`}>
          {subdomain}.bearblog.dev{path}
        </span>
        <span className="theme-preview-actions">
          {path !== '/' && (
            <button type="button" className="btn btn-sm" onClick={() => go('/')}>
              <Icon name="home" size={14} /> Home
            </button>
          )}
          {path !== '/blog/' && (
            <button type="button" className="btn btn-sm" onClick={() => go('/blog/')}>
              <Icon name="posts" size={14} /> Blog
            </button>
          )}
          <span className="seg seg-sm" role="group" aria-label="Preview width">
            <button type="button" className={!phone ? 'on' : ''} aria-pressed={!phone} onClick={() => setPhone(false)}>
              Desktop
            </button>
            <button type="button" className={phone ? 'on' : ''} aria-pressed={phone} onClick={() => setPhone(true)}>
              Phone
            </button>
          </span>
        </span>
      </div>
      <div className={`theme-preview-body ${phone ? 'phone' : ''} ${state === 'loading' ? 'is-loading' : ''}`}>
        {state === 'error' ? (
          <p className="theme-preview-error muted small">
            {error}{' '}
            <button type="button" className="btn btn-sm" onClick={() => go(path)}>
              Try again
            </button>
          </p>
        ) : (
          <iframe key={frameKey} ref={frame} src={FRAME_URL} sandbox={SANDBOX} referrerPolicy="no-referrer" title="Theme preview on your blog" />
        )}
      </div>
    </div>
  )
}
