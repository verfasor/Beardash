import { useEffect, useRef, useState } from 'react'
import { bear, cached, revisions, lf } from '../api'
import { useSession } from '../App'
import { setNavigationGuard } from '../router'
import { CodeEditor } from '../components/CodeEditor'
import { CssHistory, STYLES_HISTORY_KEY } from '../components/CssHistory'
import { ThemePreview } from '../components/ThemePreview'
import { ThemeGallery } from '../components/ThemeGallery'
import { Icon, Skel, useToast, confirmDialog } from '../ui'

/** The blog's CSS (Bear's custom_styles): write it, start from a Bear theme, preview it live, or go back in history. */
export function Themes() {
  const toast = useToast()
  const { session } = useSession()
  const [saved, setSaved] = useState<string | null>(() => {
    const c = cached.blog()
    return c ? lf(c.custom_styles) : null
  })
  const [savedAt, setSavedAt] = useState<string | undefined>(() => cached.blog()?.last_modified)
  const [css, setCss] = useState(saved ?? '')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [history, setHistory] = useState(false)
  const [gallery, setGallery] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    bear
      .getBlog()
      .then((b) => {
        const v = lf(b.custom_styles)
        setSaved(v)
        setSavedAt(b.last_modified)
        // Don't clobber anything typed while the cached copy was showing.
        if (!touched.current) setCss(v)
      })
      .catch((e) => toast(e.message, 'error'))
  }, [toast])

  const edit = (v: string) => {
    touched.current = true
    setCss(v)
  }
  const dirty = saved !== null && css !== saved

  useEffect(() => {
    setNavigationGuard(
      dirty
        ? () =>
            confirmDialog({
              title: 'Discard unsaved CSS?',
              body: "Your changes to your blog's CSS haven't been saved.",
              confirm: 'Discard',
              cancel: 'Keep editing',
              danger: true,
            })
        : null,
    )
    const onUnload = (e: BeforeUnloadEvent) => dirty && e.preventDefault()
    addEventListener('beforeunload', onUnload)
    return () => {
      setNavigationGuard(null)
      removeEventListener('beforeunload', onUnload)
    }
  }, [dirty])

  const save = async () => {
    if (!dirty || saving || saved === null) return
    setSaving(true)
    try {
      const sent = css
      const res = await bear.updateBlog({ custom_styles: sent })
      const next = lf(res.custom_styles ?? sent)
      // Like posts: keep what was on Bear before the first edit, then each saved version.
      revisions
        .addFromBear(STYLES_HISTORY_KEY, 'Theme CSS', saved, savedAt)
        .then(() => revisions.add(STYLES_HISTORY_KEY, 'Theme CSS', next))
        .catch(() => {})
      setSaved(next)
      setSavedAt(res.last_modified)
      // Keep anything typed while the save was in flight.
      setCss((c) => (c === sent ? next : c))
      toast('Theme saved')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return (
    <div className={`page page-wide ${preview ? 'page-xwide' : ''}`}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Themes</h1>
          <p className="page-sub">Your blog's CSS. Start from a Bear theme or write your own, and preview it on your blog before saving.</p>
        </div>
      </header>

      {saved === null ? (
        <div className="editor-frame" aria-busy="true">
          <div className="editor-frame-body" style={{ padding: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skel key={i} w={`${60 - i * 10}%`} h={12} />
            ))}
          </div>
        </div>
      ) : (
        <div className="editor-frame">
          <div className="editor-frame-bar">
            <span className="muted small" style={{ paddingLeft: 6 }}>
              CSS
            </span>
            <span className="editor-frame-actions">
              <button type="button" className="btn btn-sm" onClick={() => setGallery(true)}>
                <Icon name="palette" size={14} /> Bear themes
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setHistory(true)}>
                <Icon name="history" size={14} /> History
              </button>
              <button type="button" className={`btn btn-sm ${preview ? 'on' : ''}`} aria-pressed={preview} onClick={() => setPreview((v) => !v)}>
                <Icon name="eye" size={14} /> Preview
              </button>
            </span>
          </div>
          <ThemeGallery
            open={gallery}
            onClose={() => setGallery(false)}
            subdomain={session.subdomain}
            onApply={async (v) => {
              // Keep what was in the editor so switching themes can be undone from History. Unedited, it's Bear's version.
              const keep = css === saved ? revisions.addFromBear(STYLES_HISTORY_KEY, 'Theme CSS', css, savedAt) : css.trim() ? revisions.add(STYLES_HISTORY_KEY, 'Theme CSS', css) : null
              await keep?.catch(() => {})
              edit(v)
              setPreview(true)
            }}
          />
          <CssHistory open={history} onClose={() => setHistory(false)} current={css} onRestore={edit} />
          <div className={`editor-frame-body ${preview ? 'with-theme-preview' : ''}`}>
            <CodeEditor value={css} onChange={edit} language="css" placeholder=":root { }" monospace />
            {preview && <ThemePreview css={css} subdomain={session.subdomain} />}
          </div>
        </div>
      )}

      {dirty && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <span>Unsaved CSS changes</span>
          <button className="btn btn-sm btn-ghost-inverse" onClick={() => saved !== null && setCss(saved)} disabled={saving}>
            Discard
          </button>
          <button className="btn btn-sm btn-inverse" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
