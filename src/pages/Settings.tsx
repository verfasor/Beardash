import { useEffect, useMemo, useRef, useState } from 'react'
import { bear, cached, revisions, lf, type BlogSettings } from '../api'
import { useSession } from '../App'
import { ImageField } from '../components/ImageField'
import { setNavigationGuard, useRouter } from '../router'
import { CodeEditor } from '../components/CodeEditor'
import { Preview } from '../components/Preview'
import { Skel, useToast, confirmDialog } from '../ui'
import { MetaImageStyleForm } from '../components/MetaImage'
import { defaultStyle, loadStyle, saveStyle, type MetaImageStyle } from '../meta-image'

type Tab = 'general' | 'home' | 'nav' | 'styles' | 'seo' | 'social'
const TABS: { key: Tab; label: string; desc: string; beta?: boolean }[] = [
  { key: 'general', label: 'General', desc: 'Title, favicon and date format.' },
  { key: 'home', label: 'Home page', desc: 'Shown above your post list on the front page.' },
  { key: 'nav', label: 'Navigation', desc: 'Links in your blog header, written as Markdown.' },
  { key: 'styles', label: 'Theme CSS', desc: 'Custom styles applied on top of your Bear theme.' },
  { key: 'seo', label: 'SEO', desc: 'How your blog appears in search results and when shared.' },
  { key: 'social', label: 'Social image', desc: 'The style of social images generated for posts and pages.', beta: true },
]
const Beta = () => <sup className="beta-pill">Beta</sup>
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.key === v)

const normalize = (b: BlogSettings): BlogSettings => {
  const out: BlogSettings = { ...b }
  for (const k of KEYS) if (typeof out[k] === 'string' || out[k] == null) out[k] = lf(out[k] as string | null)
  return out
}

const KEYS: (keyof BlogSettings)[] = ['title', 'content', 'favicon', 'meta_description', 'meta_image', 'nav', 'custom_styles', 'robots_txt', 'date_format']

export function Settings() {
  const toast = useToast()
  const { session, setSession } = useSession()
  const { search, navigate } = useRouter()
  const urlTab = new URLSearchParams(search).get('tab')
  const [tab, setTabState] = useState<Tab>(isTab(urlTab) ? urlTab : 'general')
  // Keep ?tab= in the URL so sections (e.g. /settings?tab=seo) can be linked to and survive a refresh.
  const setTab = (t: Tab) => {
    setTabState(t)
    navigate(t === 'general' ? '/settings' : `/settings?tab=${t}`, { replace: true })
  }
  useEffect(() => {
    if (isTab(urlTab) && urlTab !== tab) setTabState(urlTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab])
  const [saved, setSaved] = useState<BlogSettings | null>(() => {
    const c = cached.blog()
    return c ? normalize(c) : null
  })
  const [form, setForm] = useState<BlogSettings>(() => saved ?? {})
  const [saving, setSaving] = useState(false)
  const [homeView, setHomeView] = useState<'write' | 'preview'>('write')
  const touched = useRef(false)
  // The social image style is kept in this browser, so it saves as you type instead of through the save bar.
  const [ogStyle, setOgStyle] = useState<MetaImageStyle>(() => loadStyle(session.subdomain, session.blogTitle ?? ''))
  const updateOgStyle = (s: MetaImageStyle) => {
    setOgStyle(s)
    saveStyle(session.subdomain, s)
  }

  useEffect(() => {
    bear
      .getBlog()
      .then((raw) => {
        const b = normalize(raw)
        setSaved(b)
        // Don't clobber anything typed while the cached copy was showing.
        if (!touched.current) setForm(b)
      })
      .catch((e) => toast(e.message, 'error'))
  }, [toast])

  const changed = useMemo(() => {
    if (!saved) return {}
    const out: Partial<BlogSettings> = {}
    for (const k of KEYS) if ((form[k] ?? '') !== (saved[k] ?? '')) out[k] = form[k] ?? ''
    return out
  }, [form, saved])
  const dirtyCount = Object.keys(changed).length

  useEffect(() => {
    setNavigationGuard(
      dirtyCount
        ? () =>
            confirmDialog({
              title: 'Discard unsaved settings?',
              body: "Your changes to blog settings haven't been saved.",
              confirm: 'Discard',
              cancel: 'Keep editing',
              danger: true,
            })
        : null,
    )
    const onUnload = (e: BeforeUnloadEvent) => dirtyCount && e.preventDefault()
    addEventListener('beforeunload', onUnload)
    return () => {
      setNavigationGuard(null)
      removeEventListener('beforeunload', onUnload)
    }
  }, [dirtyCount])

  const save = async () => {
    if (!dirtyCount || saving) return
    setSaving(true)
    try {
      const res = normalize(await bear.updateBlog(changed))
      const next = { ...saved, ...changed, ...res }
      setSaved(next)
      setForm((f) => ({ ...f, ...res }))
      if ('content' in changed) revisions.add('_home', next.title ?? '', next.content ?? '').catch(() => {})
      if ('title' in changed || 'favicon' in changed) setSession({ ...session, blogTitle: next.title ?? null, favicon: next.favicon ?? '' })
      toast('Settings saved')
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

  const set = (k: keyof BlogSettings) => (v: string) => {
    touched.current = true
    setForm((f) => ({ ...f, [k]: v }))
  }
  // Row layout: label and hint on the left, the input on the right (stacks on narrow screens).
  const image = (k: 'favicon' | 'meta_image', label: string, hint: string, opts: { placeholder?: string; allowText?: boolean; shape?: 'wide' | 'square' } = {}) => (
    <div className="field setting-field">
      <span className="field-text">
        <label className="label" htmlFor={`setting-${k}`}>
          {label}
        </label>
        <small className="hint">{hint}</small>
      </span>
      <ImageField id={`setting-${k}`} value={form[k] ?? ''} onChange={set(k)} placeholder={opts.placeholder} allowText={opts.allowText} shape={opts.shape} />
    </div>
  )

  const text = (k: keyof BlogSettings, label: string, hint?: string, placeholder?: string) => (
    <label className="field setting-field">
      <span className="field-text">
        <span className="label">{label}</span>
        {hint && <small className="hint">{hint}</small>}
      </span>
      <input value={form[k] ?? ''} placeholder={placeholder} onChange={(e) => set(k)(e.target.value)} spellCheck={false} />
    </label>
  )

  if (!saved)
    return (
      <div className="page page-wide" aria-busy="true">
        <header className="page-header">
          <h1 className="page-title">Settings</h1>
        </header>
        <div className="settings-layout">
          <nav className="subnav">
            {TABS.map((t) => (
              <span key={t.key} className={`subnav-item ${t.key === tab ? 'active' : ''}`}>
                <span>
                  {t.label}
                  {t.beta && <Beta />}
                </span>
              </span>
            ))}
          </nav>
          <div className="settings-body">
            <div className="settings-head">
              <h2 className="section-title">{TABS.find((t) => t.key === tab)!.label}</h2>
              <p className="muted small">{TABS.find((t) => t.key === tab)!.desc}</p>
            </div>
            <div className="form-narrow">
              {[0, 1, 2].map((i) => (
                <div key={i} className="field">
                  <Skel w={90} h={12} />
                  <Skel w="100%" h={34} r={6} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )

  const current = TABS.find((t) => t.key === tab)!

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>

      <div className="settings-layout">
        <nav className="subnav" aria-label="Settings sections">
          {TABS.map((t) => {
            const tabDirty =
              (t.key === 'general' && ('title' in changed || 'favicon' in changed || 'date_format' in changed)) ||
              (t.key === 'home' && 'content' in changed) ||
              (t.key === 'nav' && 'nav' in changed) ||
              (t.key === 'styles' && 'custom_styles' in changed) ||
              (t.key === 'seo' && ('meta_description' in changed || 'meta_image' in changed || 'robots_txt' in changed))
            return (
              <button
                key={t.key}
                className={`subnav-item ${tab === t.key ? 'active' : ''}`}
                aria-current={tab === t.key ? 'page' : undefined}
                onClick={() => setTab(t.key)}
              >
                <span>
                  {t.label}
                  {t.beta && <Beta />}
                </span>
                {tabDirty && <span className="dirty-dot" aria-label="unsaved changes" />}
              </button>
            )
          })}
        </nav>

        <div className="settings-body">
          <div className="settings-head">
            <h2 className="section-title">
              {current.label}
              {current.beta && <Beta />}
            </h2>
            <p className="muted small">{current.desc}</p>
          </div>

          {tab === 'general' && (
            <div className="form-narrow">
              {text('title', 'Blog title')}
              {image('favicon', 'Favicon', 'An emoji, an image URL, or upload one.', { placeholder: '🐻', allowText: true, shape: 'square' })}
              {text('date_format', 'Date format', 'Uses Django format codes. “d M, Y” shows as 11 Sep, 2026.', 'd M, Y')}
            </div>
          )}

          {tab === 'home' && (
            <div className="editor-frame">
              <div className="editor-frame-bar">
                <div className="seg seg-sm">
                  <button className={homeView === 'write' ? 'on' : ''} onClick={() => setHomeView('write')}>
                    Write
                  </button>
                  <button className={homeView === 'preview' ? 'on' : ''} onClick={() => setHomeView('preview')}>
                    Preview
                  </button>
                </div>
                <span className="muted small">Markdown, HTML and LaTeX supported</span>
              </div>
              <div className="editor-frame-body">
                {homeView === 'preview' ? (
                  <Preview content={form.content ?? ''} />
                ) : (
                  <CodeEditor value={form.content ?? ''} onChange={set('content')} placeholder="Introduce yourself and your blog." onUpload={(f) => bear.uploadMedia(f)} />
                )}
              </div>
            </div>
          )}

          {tab === 'nav' && (
            <div className="editor-frame">
              <div className="editor-frame-body short">
                <CodeEditor value={form.nav ?? ''} onChange={set('nav')} placeholder="[Home](/) [Blog](/blog/) [About](/about/)" monospace />
              </div>
            </div>
          )}

          {tab === 'styles' && (
            <div className="editor-frame">
              <div className="editor-frame-body">
                <CodeEditor value={form.custom_styles ?? ''} onChange={set('custom_styles')} language="css" placeholder=":root { }" monospace />
              </div>
            </div>
          )}

          {tab === 'social' && (
            <MetaImageStyleForm
              style={ogStyle}
              onChange={updateOgStyle}
              onReset={() => updateOgStyle(defaultStyle(saved.title || session.blogTitle || '', session.subdomain))}
            />
          )}

          {tab === 'seo' && (
            <div className="form-narrow">
              <label className="field setting-field stacked">
                <span className="field-text">
                  <span className="label">
                    Description{' '}
                    <span className={`counter ${(form.meta_description ?? '').length > 160 ? 'over' : ''}`}>{(form.meta_description ?? '').length}/160</span>
                  </span>
                  <small className="hint">Used by search engines and link previews.</small>
                </span>
                <textarea rows={3} value={form.meta_description ?? ''} onChange={(e) => set('meta_description')(e.target.value)} />
              </label>
              {image('meta_image', 'Social image', 'Shown when your blog is shared on social media. 1200×630 works best.')}
              <label className="field setting-field stacked">
                <span className="field-text">
                  <span className="label">robots.txt</span>
                  <small className="hint">Tells search engines and crawlers what they may index.</small>
                </span>
                <textarea className="mono-input" rows={8} value={form.robots_txt ?? ''} onChange={(e) => set('robots_txt')(e.target.value)} spellCheck={false} />
              </label>
            </div>
          )}
        </div>
      </div>

      {dirtyCount > 0 && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <span>
            {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
          </span>
          <button className="btn btn-sm btn-ghost-inverse" onClick={() => saved && setForm(saved)} disabled={saving}>
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
