import { useEffect, useRef, useState } from 'react'
import { bear } from '../api'
import { Link } from '../router'
import { Icon, Modal, useToast } from '../ui'
import { FONTS, FORMATS, canvasToFile, drawMetaImage, loadImage, normHex, ogFileName, type MetaImageStyle } from '../meta-image'
import { ImageField } from './ImageField'

/** Live preview of the card. The canvas is drawn at full size and scaled down with CSS. */
export function MetaImageCanvas({
  title,
  description = '',
  style,
  canvasRef,
}: {
  title: string
  description?: string
  style: MetaImageStyle
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}) {
  const own = useRef<HTMLCanvasElement>(null)
  const ref = canvasRef ?? own
  useEffect(() => {
    if (ref.current) drawMetaImage(ref.current, title, style, description).catch(() => {})
  }, [ref, title, description, style])
  return <canvas ref={ref} className="meta-image-canvas" role="img" aria-label={`Social image: ${title || 'Untitled'}`} />
}

/** Generates a social image for a post, uploads it to Bear and hands back its URL. */
export function MetaImageModal({
  open,
  onClose,
  onUse,
  title,
  description,
  slug,
  style,
  hasImage,
  noun = 'post',
}: {
  open: boolean
  onClose: () => void
  onUse: (url: string) => void
  title: string
  description: string
  slug: string
  style: MetaImageStyle
  hasImage: boolean
  noun?: string
}) {
  const toast = useToast()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [text, setText] = useState(title)
  const [desc, setDesc] = useState(description)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setText(title)
      setDesc(description)
    }
  }, [open, title, description])

  const file = () => canvasToFile(canvas.current!, ogFileName(slug, text), style.format)

  const use = async () => {
    setBusy(true)
    try {
      const m = await bear.uploadMedia(await file(), true)
      onUse(m.url)
      toast(hasImage ? 'Social image replaced. Save to apply.' : 'Social image added. Save to apply.')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    try {
      const f = await file()
      const url = URL.createObjectURL(f)
      const a = document.createElement('a')
      a.href = url
      a.download = f.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="lg"
      title="Generate social image"
      description={
        <>
          1200×630 {FORMATS.find((f) => f.value === style.format)?.label}, uploaded to your Bear media. <Link to="/settings?tab=social">Change the style</Link>
        </>
      }
      footer={
        <>
          <button className="btn" onClick={download} disabled={busy}>
            <Icon name="download" size={14} /> Download
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={use} disabled={busy}>
            {busy ? 'Uploading…' : hasImage ? 'Upload and replace' : 'Upload and use'}
          </button>
        </>
      }
    >
      <MetaImageCanvas title={text} description={desc} style={style} canvasRef={canvas} />
      <label className="field" style={{ marginTop: 14 }}>
        <span className="label">Title on the image</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Untitled" disabled={busy} />
      </label>
      {style.showDescription && (
        <label className="field">
          <span className="label">Description on the image</span>
          <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" disabled={busy} />
        </label>
      )}
      <small className="hint">
        {style.showDescription ? 'These default to' : 'This defaults to'} the {noun}'s {style.showDescription ? 'title and description' : 'title'}. Changing{' '}
        {style.showDescription ? 'them' : 'it'} here doesn't change the {noun}.
      </small>
    </Modal>
  )
}

const SAMPLE = 'Your post title goes here, wrapped over a couple of lines'
const SAMPLE_DESC = 'And its description, if you choose to show it, sits underneath in smaller text.'

const FORMAT_HINT: Record<string, string> = {
  png: 'Sharpest text, largest file.',
  jpeg: 'Much smaller, and every social site shows it.',
  webp: "Smallest, but a few social sites and older apps don't show it.",
}

/** The style controls on Settings → Social image. Saved in this browser as you type. */
export function MetaImageStyleForm({ style, onChange, onReset }: { style: MetaImageStyle; onChange: (s: MetaImageStyle) => void; onReset: () => void }) {
  // Hex fields keep what's typed; the style only takes a value once it's a valid colour.
  const [hex, setHex] = useState({ background: style.background, text: style.text })
  useEffect(() => setHex({ background: style.background, text: style.text }), [style.background, style.text])
  const set = <K extends keyof MetaImageStyle>(k: K, v: MetaImageStyle[K]) => onChange({ ...style, [k]: v })

  // Show roughly how big the chosen format is, measured on the preview itself.
  const preview = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState('')
  useEffect(() => {
    let live = true
    const t = setTimeout(async () => {
      if (!preview.current) return
      await drawMetaImage(preview.current, SAMPLE, style, SAMPLE_DESC)
      const f = await canvasToFile(preview.current, 'x', style.format).catch(() => null)
      if (live && f) setSize(f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`)
    }, 400)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [style])

  // Check the avatar can be drawn: images from sites that don't allow cross-origin reads can't be.
  const [avatarOk, setAvatarOk] = useState(true)
  useEffect(() => {
    let live = true
    const src = style.avatar.trim()
    if (!src) return setAvatarOk(true)
    const t = setTimeout(() => loadImage(src).then((img) => live && setAvatarOk(!!img)), 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [style.avatar])

  const color = (k: 'background' | 'text', label: string) => (
    <label className="field setting-field">
      <span className="field-text">
        <span className="label">{label}</span>
      </span>
      <span className="color-field">
        <input type="color" value={style[k]} onChange={(e) => set(k, e.target.value)} aria-label={`${label} picker`} />
        <input
          value={hex[k]}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setHex((h) => ({ ...h, [k]: e.target.value }))
            const v = normHex(e.target.value)
            if (v) set(k, v)
          }}
          onBlur={() => setHex((h) => ({ ...h, [k]: style[k] }))}
        />
      </span>
    </label>
  )

  return (
    <>
    <p className="muted small meta-image-intro">
      Generate an image from the Social image field in a post or page's details. These settings are saved in this browser only.
    </p>
    <div className="form-narrow">
      <div className="meta-image-preview">
        <MetaImageCanvas title={SAMPLE} description={SAMPLE_DESC} style={style} canvasRef={preview} />
      </div>
      <label className="field setting-field">
        <span className="field-text">
          <span className="label">Name</span>
          <small className="hint">Leave empty for none.</small>
        </span>
        <input value={style.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="field setting-field">
        <span className="field-text">
          <span className="label">Subline</span>
          <small className="hint">A domain or tagline. Leave empty for none.</small>
        </span>
        <input value={style.subline} onChange={(e) => set('subline', e.target.value)} spellCheck={false} />
      </label>
      <div className="field setting-field">
        <span className="field-text">
          <label className="label" htmlFor="og-avatar">
            Avatar
          </label>
          <small className={`hint ${avatarOk ? '' : 'is-error'}`}>
            {avatarOk
              ? 'An image URL, or upload one to your Bear media. Leave empty for none.'
              : "This image's site doesn't allow it to be used here. Upload it instead."}
          </small>
        </span>
        <ImageField id="og-avatar" value={style.avatar} onChange={(v) => set('avatar', v)} shape="square" />
      </div>
      <div className="field setting-field">
        <span className="field-text">
          <span className="label">Avatar shape</span>
        </span>
        <span>
          <span className="seg seg-sm" role="group" aria-label="Avatar shape">
            {(['square', 'circle'] as const).map((v) => (
              <button key={v} type="button" className={style.avatarShape === v ? 'on' : ''} aria-pressed={style.avatarShape === v} onClick={() => set('avatarShape', v)}>
                {v === 'square' ? 'Rounded square' : 'Circle'}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div className="field setting-field">
        <span className="field-text">
          <span className="label">Description</span>
          <small className="hint">Show the post's description under the title. The title then fits on two lines.</small>
        </span>
        <span>
          <span className="seg seg-sm" role="group" aria-label="Description">
            {([false, true] as const).map((v) => (
              <button key={String(v)} type="button" className={style.showDescription === v ? 'on' : ''} aria-pressed={style.showDescription === v} onClick={() => set('showDescription', v)}>
                {v ? 'Show' : 'Hide'}
              </button>
            ))}
          </span>
        </span>
      </div>
      {color('background', 'Background')}
      {color('text', 'Text colour')}
      <label className="field setting-field">
        <span className="field-text">
          <span className="label">Font</span>
        </span>
        <select className="select" value={style.font} onChange={(e) => set('font', e.target.value)}>
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field setting-field">
        <span className="field-text">
          <span className="label">Format</span>
          <small className="hint">{FORMAT_HINT[style.format]}</small>
        </span>
        <span>
          <span className="seg seg-sm" role="group" aria-label="Image format">
            {FORMATS.map((f) => (
              <button key={f.value} type="button" className={style.format === f.value ? 'on' : ''} aria-pressed={style.format === f.value} onClick={() => set('format', f.value)}>
                {f.label}
              </button>
            ))}
          </span>
          {size && <small className="hint format-size">About {size} for this preview</small>}
        </span>
      </div>
      <div className="field setting-field">
        <span className="field-text">
          <span className="label">Defaults</span>
          <small className="hint">Your blog's title and address on white.</small>
        </span>
        <span>
          <button type="button" className="btn btn-sm" onClick={onReset}>
            Reset to defaults
          </button>
        </span>
      </div>
    </div>
    </>
  )
}
