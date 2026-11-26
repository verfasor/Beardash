import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Marked } from 'marked'

// Script-enabled preview. The post renders in a sandboxed iframe that the browser treats as a separate,
// anonymous origin (no allow-same-origin): its scripts can't touch this page, its memory or the stored
// API keys, can't navigate the app, and can't show dialogs or start downloads. Only the post content is
// ever sent in. Set VITE_PREVIEW_URL to serve the frame from a separate domain for even stronger isolation.

const FRAME_URL = (import.meta.env.VITE_PREVIEW_URL as string | undefined) || (import.meta.env.DEV ? '/preview-frame.html' : '/preview-frame')
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'
const RERENDER_MS = 600

const md = new Marked({ gfm: true, breaks: false })

function currentTheme(): 'light' | 'dark' {
  const t = document.documentElement.getAttribute('data-theme')
  if (t === 'dark' || t === 'light') return t
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export type PreviewFrameHandle = { scrollTo: (ratio: number) => void }

export const PreviewFrame = forwardRef<PreviewFrameHandle, { title?: string; content: string; className?: string }>(function PreviewFrame(
  { title, content, className },
  ref,
) {
  const frame = useRef<HTMLIFrameElement>(null)
  const ratio = useRef(0)
  const latest = useRef({ title, content })
  latest.current = { title, content }
  // A new key reloads the frame: a clean page each time, so old scripts and timers don't linger.
  const [renderKey, setRenderKey] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setRenderKey((k) => k + 1), RERENDER_MS)
    return () => clearTimeout(t)
  }, [title, content])

  useEffect(() => {
    setLoading(true)
    let sent = false
    const onMessage = (e: MessageEvent) => {
      // Only ever react to our own frame, and only to the one message we expect.
      if (!frame.current || e.source !== frame.current.contentWindow) return
      if (sent || e.data?.type !== 'beardash:ready') return // answer once per render, ignore everything else
      sent = true
      const { title, content } = latest.current
      frame.current.contentWindow?.postMessage(
        { type: 'beardash:render', title: title ?? '', html: md.parse(content, { async: false }) as string, theme: currentTheme(), scrollRatio: ratio.current },
        '*', // the sandboxed frame's origin is opaque ("null"), so it can't be named; nothing secret is sent
      )
      setLoading(false)
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [renderKey])

  useImperativeHandle(ref, () => ({
    scrollTo: (r: number) => {
      ratio.current = r
      frame.current?.contentWindow?.postMessage({ type: 'beardash:scroll', ratio: r }, '*')
    },
  }))

  return (
    <div className={`preview-frame-wrap ${loading ? 'is-loading' : ''} ${className ?? ''}`}>
      <iframe
        key={renderKey}
        ref={frame}
        src={FRAME_URL}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        title="Post preview with scripts"
        className="preview-frame"
      />
    </div>
  )
})
