import { useEffect, useRef, useState } from 'react'
import { bear, type MediaItem } from '../api'
import { Modal, Icon, Spinner, Skel, useToast } from '../ui'

// ---------- link ----------
export function LinkModal({
  open,
  initialText,
  onClose,
  onInsert,
}: {
  open: boolean
  initialText: string
  onClose: () => void
  onInsert: (text: string, url: string) => void
}) {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!open) return
    const looksLikeUrl = /^(https?:\/\/|\/)/.test(initialText)
    setText(looksLikeUrl ? '' : initialText)
    setUrl(looksLikeUrl ? initialText : '')
  }, [open, initialText])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!url.trim()) return
    let href = url.trim()
    if (!/^([a-z]+:|\/|#)/i.test(href)) href = 'https://' + href
    onInsert(text.trim() || href, href)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Insert link"
      initialFocus={initialText && !/^(https?:\/\/|\/)/.test(initialText) ? 'input[name=url]' : 'input[name=text]'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => submit()} disabled={!url.trim()}>
            Insert
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span className="label">Text</span>
          <input name="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Link text" />
        </label>
        <label className="field">
          <span className="label">URL</span>
          <input name="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com or /about/" spellCheck={false} />
        </label>
        <button hidden />
      </form>
    </Modal>
  )
}

// ---------- image ----------
type ImageTab = 'upload' | 'library' | 'url'

export function ImageModal({
  open,
  onClose,
  onInsert,
  pick = false,
}: {
  open: boolean
  onClose: () => void
  onInsert: (alt: string, url: string) => void
  /** Choosing an image for a URL field (social image, favicon): library first, no alt text, no URL tab, originals kept. */
  pick?: boolean
}) {
  const toast = useToast()
  const [tab, setTab] = useState<ImageTab>(pick ? 'library' : 'upload')
  const [alt, setAlt] = useState('')
  const [url, setUrl] = useState('')
  const [picked, setPicked] = useState<MediaItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [raw, setRaw] = useState(pick)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      if (pick) setTab('library')
      setAlt('')
      setUrl('')
      setPicked(null)
      setUploading(false)
    }
  }, [open])

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Choose an image file', 'error')
    if (file.size > 10 * 1024 * 1024) return toast('Images must be under 10 MB', 'error')
    setUploading(true)
    try {
      const m = await bear.uploadMedia(file, raw)
      onInsert(alt.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), m.url)
    } catch (e) {
      toast((e as Error).message, 'error')
      setUploading(false)
    }
  }

  const insertSelected = () => {
    if (tab === 'library' && picked) onInsert(alt.trim() || picked.name.replace(/\.[^.]+$/, ''), picked.url)
    if (tab === 'url' && url.trim()) onInsert(alt.trim(), url.trim())
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={pick ? 'Choose image' : 'Insert image'}
      footer={
        tab !== 'upload' ? (
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={insertSelected} disabled={tab === 'library' ? !picked : !url.trim()}>
              {pick ? 'Use image' : 'Insert'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="seg seg-full" role="tablist">
        {(
          (pick
            ? [
                ['library', 'Media library'],
                ['upload', 'Upload'],
              ]
            : [
                ['upload', 'Upload'],
                ['library', 'Media library'],
                ['url', 'From URL'],
              ]) as [ImageTab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="image-modal-body">
        {tab === 'upload' && (
          <>
            <button
              className={`dropzone ${drag ? 'over' : ''}`}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                upload(e.dataTransfer.files[0])
              }}
              disabled={uploading}
            >
              {uploading ? (
                <Spinner label="Uploading to Bear…" />
              ) : (
                <>
                  <Icon name="upload" size={20} />
                  <span className="dropzone-title">Drop an image or click to browse</span>
                  <span className="dropzone-hint">PNG, JPG, GIF, WebP or SVG, up to 10 MB</span>
                </>
              )}
            </button>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
            <label className="check">
              <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
              <span>
                Keep original size and format
                <small>Otherwise Bear resizes to 1200px wide and converts to WebP.</small>
              </span>
            </label>
          </>
        )}

        {tab === 'library' && <MediaPicker selected={picked} onSelect={setPicked} onConfirm={insertSelected} />}

        {tab === 'url' && (
          <label className="field">
            <span className="label">Image URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" spellCheck={false} autoFocus />
          </label>
        )}

        {!pick && (

        <label className="field">
          <span className="label">
            Alt text <span className="label-hint">Describes the image for screen readers</span>
          </span>
          <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="A brown bear fishing in a river" />
        </label>

        )}
      </div>
    </Modal>
  )
}

function MediaPicker({ selected, onSelect, onConfirm }: { selected: MediaItem | null; onSelect: (m: MediaItem) => void; onConfirm: () => void }) {
  const toast = useToast()
  const [items, setItems] = useState<MediaItem[] | null>(null)
  useEffect(() => {
    bear
      .listMedia({ type: 'image' })
      .then((r) => setItems(r.media))
      .catch((e) => {
        toast(e.message, 'error')
        setItems([])
      })
  }, [toast])
  if (!items)
    return (
      <div className="picker-grid" aria-busy="true">
        {Array.from({ length: 10 }, (_, i) => (
          <Skel key={i} className="picker-skel" />
        ))}
      </div>
    )
  if (!items.length) return <p className="muted pad">No images in your library yet.</p>
  return (
    <div className="picker-grid" role="listbox" aria-label="Images">
      {items.map((m) => (
        <button
          key={m.id}
          role="option"
          aria-selected={selected?.id === m.id}
          className={`picker-item ${selected?.id === m.id ? 'on' : ''}`}
          onClick={() => onSelect(m)}
          onDoubleClick={() => {
            onSelect(m)
            setTimeout(onConfirm)
          }}
          title={m.name}
        >
          <img src={m.url} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

// ---------- publish / schedule ----------
export function PublishModal({
  open,
  onClose,
  onConfirm,
  initialDate,
  discoverable,
  url,
  isPage,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (opts: { date: string | null; discoverable: boolean }) => void
  initialDate: string // local datetime-local value or ''
  discoverable: boolean
  url: string
  isPage: boolean
}) {
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [date, setDate] = useState('')
  const [disc, setDisc] = useState(discoverable)

  useEffect(() => {
    if (!open) return
    const future = initialDate && new Date(initialDate).getTime() > Date.now()
    setWhen(future ? 'later' : 'now')
    setDate(future ? initialDate : defaultLater())
    setDisc(discoverable)
  }, [open, initialDate, discoverable])

  const invalid = when === 'later' && (!date || new Date(date).getTime() <= Date.now())
  const noun = isPage ? 'page' : 'post'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Publish ${noun}`}
      description={
        <>
          Goes live at <span className="mono-inline">{url}</span>
        </>
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={invalid} onClick={() => onConfirm({ date: when === 'later' ? date : null, discoverable: disc })}>
            {when === 'later' ? 'Schedule' : 'Publish now'}
          </button>
        </>
      }
    >
      <div className="choice-group" role="radiogroup">
        <label className={`choice ${when === 'now' ? 'on' : ''}`}>
          <input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} />
          <span>
            <strong>Now</strong>
            <small>Visible on your blog immediately</small>
          </span>
        </label>
        <label className={`choice ${when === 'later' ? 'on' : ''}`}>
          <input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} />
          <span>
            <strong>Schedule</strong>
            <small>Bear publishes it at the time you pick</small>
          </span>
        </label>
      </div>
      {when === 'later' && (
        <label className="field">
          <span className="label">Date and time</span>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          {invalid && date && <small className="field-error">Pick a time in the future.</small>}
        </label>
      )}
      {!isPage && (
        <label className="check">
          <input type="checkbox" checked={disc} onChange={(e) => setDisc(e.target.checked)} />
          <span>
            List in Bear's discovery feed
            <small>Lets readers outside your blog find this post.</small>
          </span>
        </label>
      )}
    </Modal>
  )
}

function defaultLater() {
  const d = new Date(Date.now() + 864e5)
  d.setHours(9, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`
}
