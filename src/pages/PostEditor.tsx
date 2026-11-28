import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { EditorView } from '@codemirror/view'
import { bear, revisions, autosave, postStatus, lf, type Post, type PostFields, type RevisionMeta } from '../api'
import { Link, useRouter, setNavigationGuard } from '../router'
import { useSession } from '../App'
import { CodeEditor, wrapSelection, toggleLinePrefix, insertText, insertTable, mdText, safeUrl } from '../components/CodeEditor'
import { Preview, wordStats } from '../components/Preview'
import { PreviewFrame, type PreviewFrameHandle } from '../components/PreviewFrame'
import { TagInput } from '../components/TagInput'
import { ImageField } from '../components/ImageField'
import { MetaImageModal } from '../components/MetaImage'
import { loadStyle, type MetaImageStyle } from '../meta-image'
import { LinkModal, ImageModal, PublishModal } from '../components/EditorModals'
import { Icon, Skel, SkeletonRows, skelWidth, Status, Menu, Modal, relTime, useToast, useConfirm, confirmDialog, copy, MOD, type IconName } from '../ui'

type ViewMode = 'write' | 'split' | 'preview'
type Panel = null | 'details' | 'history'

const EMPTY: PostFields = {
  title: '',
  content: '',
  slug: '',
  publish: false,
  published_date: '',
  tags: [],
  is_page: false,
  discoverable: false,
  alias: '',
  canonical_url: '',
  meta_description: '',
  meta_image: '',
  class_name: '',
  lang: '',
}
const FIELDS = Object.keys(EMPTY) as (keyof PostFields)[]

// ----- dates: Bear returns UTC; <input type=datetime-local> wants local "YYYY-MM-DDTHH:mm"
const pad = (n: number) => String(n).padStart(2, '0')
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(s: string) {
  const d = new Date(s)
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return `${s}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

function toFields(p: Post): PostFields {
  return {
    title: p.title ?? '',
    content: lf(p.content),
    slug: p.slug ?? '',
    publish: p.publish ?? postStatus(p) !== 'draft',
    published_date: toLocalInput(p.published_date),
    tags: p.tags ?? [],
    is_page: !!p.is_page,
    discoverable: !!p.discoverable,
    alias: p.alias ?? '',
    canonical_url: p.canonical_url ?? '',
    meta_description: lf(p.meta_description),
    meta_image: p.meta_image ?? '',
    class_name: p.class_name ?? '',
    lang: p.lang ?? '',
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function buildPayload(form: PostFields, saved: PostFields | null): Partial<PostFields> {
  const out: Record<string, unknown> = {}
  for (const k of FIELDS) {
    if (saved && same(form[k], saved[k])) continue
    const v = form[k]
    if (k === 'published_date') {
      if (v) out[k] = fromLocalInput(v as string)
      continue
    }
    if (!saved && (v === '' || (Array.isArray(v) && v.length === 0))) continue
    out[k] = v
  }
  return out as Partial<PostFields>
}

function readRunScripts() {
  try {
    return localStorage.getItem('beardash-run-scripts') === '1'
  } catch {
    return false
  }
}

// At this width the preview pane doesn't fit next to the editor, so Split is hidden (matches styles.css).
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
  )
}
const useNarrow = () => useMedia('(max-width: 900px)')
// Phones: the Save draft button doesn't fit in the editor bar, so it moves into the ⋯ menu (matches styles.css).
const usePhone = () => useMedia('(max-width: 760px)')

function readView(): ViewMode {
  try {
    return (localStorage.getItem('beardash-view') as ViewMode) || 'split'
  } catch {
    return 'split'
  }
}

export function PostEditor({ uid, isPage }: { uid: string | null; isPage: boolean }) {
  const { navigate } = useRouter()
  const { session } = useSession()
  const toast = useToast()
  const confirm = useConfirm()
  const base = isPage ? '/pages' : '/posts'
  const noun = isPage ? 'page' : 'post'
  const draftKey = uid ?? `new-${noun}`

  const [post, setPost] = useState<Post | null>(null)
  const [form, setForm] = useState<PostFields>({ ...EMPTY, is_page: isPage })
  const [saved, setSaved] = useState<PostFields | null>(null)
  const [loading, setLoading] = useState(!!uid)
  const [saving, setSaving] = useState(false)
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null)
  const [recovery, setRecovery] = useState<{
    data: PostFields
    updatedAt: number
  } | null>(null)

  const [modePref, setMode] = useState<ViewMode>(readView)
  const narrow = useNarrow()
  const phone = usePhone()
  // On small screens Split falls back to Write; the saved choice is kept for wider screens.
  const mode: ViewMode = narrow && modePref === 'split' ? 'write' : modePref
  const modes: ViewMode[] = narrow ? ['write', 'preview'] : ['write', 'split', 'preview']
  const [panel, setPanel] = useState<Panel>(null)
  const [focus, setFocus] = useState(false)
  const [modal, setModal] = useState<null | 'link' | 'image' | 'publish'>(null)
  const [linkText, setLinkText] = useState('')
  const editorView = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<PreviewFrameHandle>(null)
  const [runScripts, setRunScripts] = useState(readRunScripts)
  const hasScripts = useMemo(() => /<script[\s>]/i.test(form.content), [form.content])
  const savedSelection = useRef<{ from: number; to: number } | null>(null)

  const dirty = useMemo(() => !same(form, saved ?? { ...EMPTY, is_page: isPage }), [form, saved, isPage])
  const status = post ? postStatus({ ...post, publish: saved?.publish }) : 'draft'
  const stats = useMemo(() => wordStats(form.content), [form.content])
  const liveUrl = post?.url ?? `${session.subdomain}.bearblog.dev/${form.slug || slugify(form.title) || '…'}/`

  useEffect(() => {
    try {
      localStorage.setItem('beardash-view', modePref)
      localStorage.setItem('beardash-run-scripts', runScripts ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [modePref, runScripts])

  // ----- load
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        let fields: PostFields | null = null
        let lastModified = 0
        if (uid) {
          const p = await bear.getPost(uid)
          if (!live) return
          fields = toFields(p)
          lastModified = p.last_modified ? Date.parse(p.last_modified) : 0
          setPost(p)
          setForm(fields)
          setSaved(fields)
        }
        const { autosave: a } = await autosave.get<PostFields>(draftKey)
        if (!live || !a) return
        const baseline = fields ?? { ...EMPTY, is_page: isPage }
        if (!same(a.data, baseline) && a.updatedAt * 1000 > lastModified) setRecovery(a)
      } catch (e) {
        if (live) toast((e as Error).message, 'error')
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [uid, draftKey, isPage, toast])

  // ----- autosave (stored in this browser)
  useEffect(() => {
    if (!dirty || loading) return
    const t = setTimeout(() => {
      autosave
        .put(draftKey, form)
        .then(() => setAutosavedAt(Date.now()))
        .catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [form, dirty, loading, draftKey])

  // ----- unsaved-changes guard
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    addEventListener('beforeunload', onUnload)
    setNavigationGuard(
      dirty
        ? () =>
            confirmDialog({
              title: 'Leave with unsaved changes?',
              body: `Your edits haven't been saved to Bear. A backup stays in Beardash, and you can restore it next time you open this ${noun}.`,
              confirm: 'Leave',
              cancel: 'Keep editing',
              danger: true,
            })
        : null,
    )
    return () => {
      removeEventListener('beforeunload', onUnload)
      setNavigationGuard(null)
    }
  }, [dirty, noun])

  const set = <K extends keyof PostFields>(k: K, v: PostFields[K]) => setForm((f) => ({ ...f, [k]: v }))

  // ----- save
  const save = useCallback(
    async (overrides: Partial<PostFields> = {}, successMsg?: string) => {
      if (saving) return
      const next = { ...form, ...overrides }
      if (!next.title.trim()) {
        toast(`Add a title before saving`, 'error')
        document.querySelector<HTMLTextAreaElement>('.title-input')?.focus()
        return
      }
      const payload = buildPayload(next, uid ? saved : null)
      if (uid && Object.keys(payload).length === 0) {
        toast('No changes to save', 'info')
        return
      }
      setSaving(true)
      try {
        const res = uid ? await bear.updatePost(uid, payload) : await bear.createPost(payload)
        // History: first keep what was on Bear before this save (if history doesn't already end with it,
        // e.g. the first edit in Beardash, or the post was changed on Bear's site), then the new version.
        const before = uid ? saved : null
        ;(async () => {
          if (before) await revisions.addFromBear(res.uid, before.title, before.content, post?.last_modified)
          await revisions.add(res.uid, next.title, next.content)
        })().catch(() => {})
        autosave.clear(draftKey).catch(() => {})
        setRecovery(null)
        if (!uid) {
          setSaved(next)
          setNavigationGuard(null)
          toast(successMsg ?? 'Draft saved')
          navigate(`${base}/${res.uid}`, { replace: true })
          return
        }
        const fields = toFields({
          ...post,
          ...res,
          content: res.content ?? next.content,
        })
        setPost((p) => ({ ...p, ...res }))
        setSaved(fields)
        setForm((f) => ({
          ...f,
          ...overrides,
          slug: fields.slug,
          published_date: fields.published_date || f.published_date,
        }))
        toast(successMsg ?? 'Saved')
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setSaving(false)
      }
    },
    [form, saved, uid, post, saving, draftKey, base, navigate, toast],
  )

  const publish = ({ date, discoverable }: { date: string | null; discoverable: boolean }) => {
    setModal(null)
    const nowLocal = toLocalInput(new Date().toISOString())
    const futureSet = form.published_date && new Date(form.published_date).getTime() > Date.now()
    const published_date = date ?? (futureSet || !form.published_date ? nowLocal : form.published_date)
    save(
      { publish: true, published_date, discoverable },
      date ? `Scheduled for ${new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Published',
    )
  }

  const unpublish = async () => {
    const ok = await confirm({
      title: `Unpublish this ${noun}?`,
      body: 'It will be removed from your blog and moved back to drafts. You can publish it again any time.',
      confirm: 'Unpublish',
    })
    if (ok) save({ publish: false }, 'Moved to drafts')
  }

  const remove = async () => {
    if (!uid) return
    const ok = await confirm({
      title: `Delete “${form.title || 'Untitled'}”?`,
      body: `This permanently deletes the ${noun} from Bear. It can't be undone.`,
      confirm: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await bear.deletePost(uid)
      autosave.clear(draftKey).catch(() => {})
      setSaved(form)
      setNavigationGuard(null)
      toast('Deleted')
      navigate(base, { replace: true })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  // ----- modals that insert into the editor
  const openLink = useCallback(() => {
    const v = editorView.current
    if (!v) return
    const r = v.state.selection.main
    savedSelection.current = { from: r.from, to: r.to }
    setLinkText(v.state.sliceDoc(r.from, r.to))
    setModal('link')
  }, [])
  const openImage = () => {
    const v = editorView.current
    if (v)
      savedSelection.current = {
        from: v.state.selection.main.from,
        to: v.state.selection.main.to,
      }
    setModal('image')
  }
  const insertAtSaved = (text: string, block = false) => {
    const v = editorView.current
    if (!v) return
    const sel = savedSelection.current ?? {
      from: v.state.selection.main.from,
      to: v.state.selection.main.to,
    }
    v.dispatch({ selection: { anchor: sel.from, head: sel.to } })
    if (block) {
      // Put block content (images) on its own paragraph
      const line = v.state.doc.lineAt(sel.from)
      const before = sel.from > line.from ? '\n\n' : ''
      const after = sel.to < v.state.doc.lineAt(sel.to).to ? '\n\n' : '\n'
      text = before + text + after
    }
    insertText(v, text)
    setModal(null)
  }

  // ----- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') {
        e.preventDefault()
        save()
      } else if (mod && e.shiftKey && k === 'p') {
        e.preventDefault()
        setMode((m) => (m === 'preview' ? 'split' : 'preview'))
      } else if (mod && e.key === '.') {
        e.preventDefault()
        setFocus((f) => !f)
      } else if (e.key === 'Escape') {
        if (panel) setPanel(null)
        else if (focus) setFocus(false)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [save, panel, focus, modal])

  const upload = useCallback(
    async (file: File) => {
      try {
        const m = await bear.uploadMedia(file)
        toast(`Uploaded ${m.name}`)
        return m
      } catch (e) {
        toast((e as Error).message, 'error')
        throw e
      }
    },
    [toast],
  )

  const syncScroll = useCallback((ratio: number) => {
    frameRef.current?.scrollTo(ratio)
    const el = previewRef.current
    if (el) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
  }, [])

  const cmd = (fn: (v: EditorView) => unknown) => () => editorView.current && fn(editorView.current)

  if (loading) {
    return (
      <div className={`editor mode-${mode}`} aria-busy="true">
        <header className="editor-bar">
          <div className="editor-bar-left">
            <Link to={base} className="icon-btn" aria-label={`Back to ${noun}s`}>
              <Icon name="back" />
            </Link>
            <Skel w={64} h={12} />
          </div>
          <div className="seg">
            {modes.map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} disabled>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <div className="editor-bar-right">
            <Skel w={92} h={32} r={6} />
          </div>
        </header>
        {mode !== 'preview' && <div className="format-bar" />}
        <div className="editor-body">
          <div className="pane">
            <div className="editor-skel">
              <Skel w="55%" h={30} r={6} />
              <div className="editor-skel-lines">
                {Array.from({ length: 7 }, (_, i) => (
                  <Skel key={i} w={i === 6 ? '40%' : skelWidth(i, 1.25)} h={13} />
                ))}
              </div>
            </div>
          </div>
          {mode === 'split' && <div className="pane pane-preview" />}
        </div>
      </div>
    )
  }

  const previewUrl = post?.url ? (status === 'draft' && post.token ? `${post.url}?token=${post.token}` : post.url) : null

  const fmt: ([IconName | string, string, () => unknown] | 'sep')[] = [
    ['H1', 'Heading 1', cmd((v) => toggleLinePrefix(v, '# '))],
    ['H2', 'Heading 2', cmd((v) => toggleLinePrefix(v, '## '))],
    ['H3', 'Heading 3', cmd((v) => toggleLinePrefix(v, '### '))],
    'sep',
    ['bold', `Bold (${MOD}B)`, cmd((v) => wrapSelection(v, '**'))],
    ['italic', `Italic (${MOD}I)`, cmd((v) => wrapSelection(v, '*'))],
    ['strike', 'Strikethrough', cmd((v) => wrapSelection(v, '~~'))],
    ['code', `Inline code (${MOD}E)`, cmd((v) => wrapSelection(v, '`', '`', 'code'))],
    'sep',
    ['link', `Link (${MOD}K)`, openLink],
    ['image', 'Image', openImage],
    ['quote', 'Quote', cmd((v) => toggleLinePrefix(v, '> '))],
    ['list', 'Bulleted list', cmd((v) => toggleLinePrefix(v, '- '))],
    ['olist', 'Numbered list', cmd((v) => toggleLinePrefix(v, '1. '))],
    ['codeBlock', 'Code block', cmd((v) => wrapSelection(v, '```\n', '\n```', 'code'))],
    ['table', 'Table', cmd(insertTable)],
    ['divider', 'Divider', cmd((v) => insertText(v, '\n\n---\n\n'))],
  ]

  const saveLabel = saving
    ? 'Saving…'
    : dirty
      ? autosavedAt
        ? `Unsaved · backed up ${relTime(new Date(autosavedAt))}`
        : 'Unsaved changes'
      : uid
        ? `Saved ${post?.last_modified ? relTime(post.last_modified) : ''}`
        : ''

  return (
    <div className={`editor ${focus ? 'focus' : ''} mode-${mode}`}>
      <header className="editor-bar">
        <div className="editor-bar-left">
          <Link to={base} className="icon-btn" aria-label={`Back to ${noun}s`} title={`Back to ${noun}s`}>
            <Icon name="back" />
          </Link>
          <Status status={uid ? status : 'new'} />
          {saveLabel && (
            <span className="save-state" title={saveLabel}>
              <span className="save-full">{saveLabel}</span>
              <span className="save-short">{saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}</span>
            </span>
          )}
        </div>

        <div className="seg" role="group" aria-label="View mode">
          {modes.map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div className="editor-bar-right">
          <div className="editor-tools">
            <button className={`icon-btn ${focus ? 'on' : ''}`} title={`Focus mode (${MOD}.)`} aria-pressed={focus} onClick={() => setFocus((f) => !f)}>
              <Icon name="focus" />
            </button>
            {uid && (
              <button
                className={`icon-btn ${panel === 'history' ? 'on' : ''}`}
                title="Revision history"
                aria-pressed={panel === 'history'}
                onClick={() => setPanel((p) => (p === 'history' ? null : 'history'))}
              >
                <Icon name="history" />
              </button>
            )}
            <button
              className={`icon-btn ${panel === 'details' ? 'on' : ''}`}
              title={`${noun[0].toUpperCase() + noun.slice(1)} settings`}
              aria-pressed={panel === 'details'}
              onClick={() => setPanel((p) => (p === 'details' ? null : 'details'))}
            >
              <Icon name="panel" />
            </button>
            {(uid || (phone && status === 'draft')) && (
              <Menu
                items={[
                  ...(phone && status === 'draft'
                    ? [
                        {
                          label: 'Save draft',
                          icon: 'check' as const,
                          disabled: saving || (!dirty && !!uid),
                          onSelect: () => save(),
                        },
                        ...(uid ? ['separator' as const] : []),
                      ]
                    : []),
                  ...(previewUrl
                    ? [
                        {
                          label: status === 'draft' ? 'Preview on Bear' : 'View on blog',
                          href: previewUrl,
                          icon: 'external' as const,
                        },
                      ]
                    : []),
                  ...(post?.url && status !== 'draft'
                    ? [
                        {
                          label: 'Copy link',
                          icon: 'link' as const,
                          onSelect: () => copy(post.url!, toast, 'Link copied'),
                        },
                      ]
                    : []),
                  ...(status !== 'draft'
                    ? [
                        {
                          label: 'Unpublish',
                          icon: 'eye' as const,
                          onSelect: unpublish,
                        },
                      ]
                    : []),
                  ...(uid
                    ? [
                        'separator' as const,
                        {
                          label: `Delete ${noun}`,
                          icon: 'trash' as const,
                          danger: true,
                          onSelect: remove,
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </div>
          <span className="bar-divider" />
          <div className="editor-actions">
            {status === 'draft' ? (
              <>
                <button className="btn btn-ghost" onClick={() => save()} disabled={saving || (!dirty && !!uid)}>
                  Save draft
                </button>
                <button className="btn btn-primary" onClick={() => setModal('publish')} disabled={saving}>
                  Publish…
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => save(undefined, status === 'scheduled' ? 'Scheduled post updated' : 'Changes published')}
                disabled={saving || !dirty}
              >
                {status === 'scheduled' ? 'Update' : 'Update post'}
              </button>
            )}
          </div>
        </div>
      </header>

      {recovery && (
        <div className="notice">
          <Icon name="history" />
          <span>Unsaved edits from {relTime(recovery.updatedAt)} were found.</span>
          <button
            className="btn btn-sm"
            onClick={() => {
              autosave.clear(draftKey).catch(() => {})
              setRecovery(null)
            }}
          >
            Discard
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setForm(recovery.data)
              setRecovery(null)
            }}
          >
            Restore
          </button>
        </div>
      )}

      {mode !== 'preview' && (
        <div className="format-bar" role="toolbar" aria-label="Formatting">
          {fmt.map((f, i) =>
            f === 'sep' ? (
              <span key={i} className="sep" />
            ) : (
              <button key={f[1]} title={f[1]} aria-label={f[1]} onClick={f[2]}>
                {f[0].startsWith('H') && f[0].length === 2 ? <span className="fmt-h">{f[0]}</span> : <Icon name={f[0] as IconName} size={16} />}
              </button>
            ),
          )}
          <span className="format-stats">
            {stats.words.toLocaleString()} {stats.words === 1 ? 'word' : 'words'} · {stats.minutes} min read
          </span>
        </div>
      )}

      <div className="editor-body">
        {mode !== 'preview' && (
          <div className="pane pane-write">
            {/* Reserves the same scrollbar space as the editor below, so the title lines up with the body
                when the system shows classic (non-overlay) scrollbars. */}
            <div className="title-wrap">
              <textarea
                className="title-input"
                rows={1}
                value={form.title}
                placeholder="Title"
                aria-label="Title"
                maxLength={200}
                onChange={(e) => set('title', e.target.value.replace(/\n/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    editorView.current?.focus()
                  }
                }}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto'
                    el.style.height = el.scrollHeight + 'px'
                  }
                }}
              />
            </div>
            <CodeEditor
              value={form.content}
              onChange={(v) => set('content', v)}
              placeholder="Write in Markdown. Paste or drop images to upload them."
              onUpload={upload}
              onLinkRequest={openLink}
              onReady={(v) => (editorView.current = v)}
              onScrollRatio={mode === 'split' ? syncScroll : undefined}
            />
          </div>
        )}
        {mode !== 'write' && (
          <div className="pane pane-preview preview-pane">
            <div className="preview-bar">
              <span className="preview-bar-label">Preview</span>
              {hasScripts && !runScripts && <span className="preview-bar-note">Scripts in this post aren't running</span>}
              <label className="check check-inline preview-toggle" title="Run the post's scripts in an isolated sandbox that can't access Beardash or your keys">
                <input type="checkbox" checked={runScripts} onChange={(e) => setRunScripts(e.target.checked)} />
                <span>Run scripts</span>
              </label>
            </div>
            {runScripts ? (
              <PreviewFrame ref={frameRef} title={form.title} content={form.content} className="preview-body" />
            ) : (
              <Preview ref={previewRef} title={form.title} content={form.content} className="preview-body" />
            )}
          </div>
        )}

        {panel === 'details' && <DetailsPanel form={form} set={set} isPage={isPage} onClose={() => setPanel(null)} />}
        {panel === 'history' && uid && (
          <HistoryPanel
            uid={uid}
            onRestore={(title, content) => {
              setForm((f) => ({ ...f, title, content }))
              toast('Revision restored. Save to keep it.', 'info')
            }}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

      <LinkModal
        open={modal === 'link'}
        initialText={linkText}
        onClose={() => {
          setModal(null)
          editorView.current?.focus()
        }}
        onInsert={(text, url) => insertAtSaved(`[${mdText(text)}](${url.replace(/[\s()]/g, (c) => encodeURIComponent(c))})`)}
      />
      <ImageModal
        open={modal === 'image'}
        onClose={() => {
          setModal(null)
          editorView.current?.focus()
        }}
        onInsert={(alt, url) => insertAtSaved(`![${mdText(alt)}](${safeUrl(url) || encodeURI(url)})`, true)}
      />
      <PublishModal
        open={modal === 'publish'}
        onClose={() => setModal(null)}
        onConfirm={publish}
        initialDate={form.published_date ?? ''}
        discoverable={form.discoverable}
        url={liveUrl.replace(/^https?:\/\//, '')}
        isPage={isPage}
      />
    </div>
  )
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ---------- settings panel ----------
function DetailsPanel({
  form,
  set,
  isPage,
  onClose,
}: {
  form: PostFields
  set: <K extends keyof PostFields>(k: K, v: PostFields[K]) => void
  isPage: boolean
  onClose: () => void
}) {
  const { session } = useSession()
  // Read the style when the generator opens, so changes made in Settings are picked up.
  const [ogStyle, setOgStyle] = useState<MetaImageStyle | null>(null)
  const text = (k: keyof PostFields, label: string, opts: { placeholder?: string; hint?: string; type?: string } = {}) => (
    <label className="field">
      <span className="label">{label}</span>
      <input type={opts.type ?? 'text'} value={form[k] as string} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} spellCheck={false} />
      {opts.hint && <small className="hint">{opts.hint}</small>}
    </label>
  )
  return (
    <aside className="side-panel" aria-label="Settings">
      <div className="side-panel-head">
        <h2>{isPage ? 'Page' : 'Post'} settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="side-panel-body">
        <section className="panel-section">
          {text('slug', 'URL slug', {
            placeholder: 'generated-from-title',
            hint: 'Bear adds a suffix if the slug is taken.',
          })}
          <label className="field">
            <span className="label">Tags</span>
            <TagInput value={form.tags} onChange={(t) => set('tags', t)} />
          </label>
          <label className="field">
            <span className="label">Publish date</span>
            <input type="datetime-local" value={form.published_date ?? ''} onChange={(e) => set('published_date', e.target.value)} />
            <small className="hint">Shown on the post. A future date schedules it.</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.is_page} onChange={(e) => set('is_page', e.target.checked)} />
            <span>
              Standalone page
              <small>Pages don't appear in your post list or feed.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.discoverable} onChange={(e) => set('discoverable', e.target.checked)} />
            <span>
              Discoverable
              <small>List in Bear's discovery feed.</small>
            </span>
          </label>
        </section>

        <section className="panel-section">
          <h3 className="section-label">Search &amp; social</h3>
          <label className="field">
            <span className="label">
              Description <span className={`counter ${form.meta_description.length > 160 ? 'over' : ''}`}>{form.meta_description.length}/160</span>
            </span>
            <textarea rows={3} value={form.meta_description} onChange={(e) => set('meta_description', e.target.value)} />
          </label>
          <div className="field">
            <label className="label" htmlFor="post-meta-image">
              Social image
            </label>
            <ImageField id="post-meta-image" value={form.meta_image} onChange={(v) => set('meta_image', v)} />
            <div>
              <button type="button" className="btn btn-sm" onClick={() => setOgStyle(loadStyle(session.subdomain, session.blogTitle ?? ''))}>
                <Icon name="image" size={14} /> Generate from title
              </button>
            </div>
            <small className="hint">Shown when this {isPage ? 'page' : 'post'} is shared on social media.</small>
            {ogStyle && (
              <MetaImageModal
                open
                onClose={() => setOgStyle(null)}
                onUse={(url) => set('meta_image', url)}
                title={form.title}
                description={form.meta_description}
                slug={form.slug}
                style={ogStyle}
                hasImage={!!form.meta_image.trim()}
                noun={isPage ? 'page' : 'post'}
              />
            )}
          </div>
          {text('canonical_url', 'Canonical URL', {
            placeholder: 'https://',
            type: 'url',
          })}
        </section>

        <section className="panel-section">
          <h3 className="section-label">Advanced</h3>
          {text('alias', 'Alias', {
            placeholder: 'old/path',
            hint: 'Another path that redirects here.',
          })}
          <div className="field-row">
            {text('class_name', 'CSS class', { placeholder: 'wide' })}
            {text('lang', 'Language', { placeholder: 'en' })}
          </div>
        </section>
      </div>
    </aside>
  )
}

// ---------- history panel ----------
function HistoryPanel({ uid, onRestore, onClose }: { uid: string; onRestore: (title: string, content: string) => void; onClose: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<RevisionMeta[] | null>(null)
  const [open, setOpen] = useState<{
    id: number
    title: string
    content: string
    created_at: number
  } | null>(null)

  useEffect(() => {
    revisions
      .list(uid)
      .then((r) => setList(r.revisions))
      .catch((e) => {
        toast(e.message, 'error')
        setList([])
      })
  }, [uid, toast])

  const fmt = (s: number) =>
    new Date(s * 1000).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

  return (
    <aside className="side-panel" aria-label="Revision history">
      <div className="side-panel-head">
        <h2>History</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="side-panel-body">
        {!list ? (
          <SkeletonRows count={5} />
        ) : list.length === 0 ? (
          <p className="muted small">A snapshot is saved each time you save from Beardash. None yet.</p>
        ) : (
          <ol className="rev-list">
            {list.map((r, i) => (
              <li key={r.id}>
                <button
                  onClick={() =>
                    revisions
                      .get(uid, r.id)
                      .then(setOpen)
                      .catch((e) => toast(e.message, 'error'))
                  }
                >
                  <span className="rev-time">{fmt(r.created_at)}</span>
                  <span className="rev-meta">
                    {i === 0 ? 'Current · ' : ''}
                    {r.fromBear ? 'From Bear · ' : ''}
                    {relTime(r.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="muted small rev-foot">The last 50 saves are kept in this browser.</p>
      </div>
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="lg"
        title="Revision"
        description={open ? fmt(open.created_at) : ''}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(null)}>
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (open) onRestore(open.title, open.content)
                setOpen(null)
              }}
            >
              Restore this version
            </button>
          </>
        }
      >
        {open && <Preview title={open.title} content={open.content} className="rev-preview" />}
      </Modal>
    </aside>
  )
}
