import { useEffect, useRef, useState } from 'react'
import { bear } from '../api'
import { Icon, useToast } from '../ui'
import { ImageModal } from './EditorModals'

/**
 * A URL field for an image that Bear only accepts as a link (social image, favicon).
 * Bear's own dashboard makes you upload elsewhere and paste the URL; here you can
 * paste a URL, upload a file straight to Bear, or pick one from the media library.
 *
 * Uploads keep the original size and format: social sites and browsers don't all read WebP,
 * and favicons are often .ico or .svg.
 */
export function ImageField({
  id,
  value,
  onChange,
  placeholder = 'https://',
  allowText = false,
  shape = 'wide',
}: {
  id?: string
  value: string
  onChange: (url: string) => void
  placeholder?: string
  /** The favicon field also takes an emoji, so don't force a URL input type. */
  allowText?: boolean
  /** Preview shape: wide for social cards, square for favicons. */
  shape?: 'wide' | 'square'
}) {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [broken, setBroken] = useState(false)
  const url = /^https:\/\//i.test(value.trim()) ? value.trim() : ''
  useEffect(() => setBroken(false), [url])

  const upload = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast('Choose an image file', 'error')
    if (f.size > 10 * 1024 * 1024) return toast('Images must be under 10 MB', 'error')
    setBusy(true)
    try {
      const m = await bear.uploadMedia(f, true)
      onChange(m.url)
      toast('Image uploaded')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  return (
    <div className="image-field">
      <input
        id={id}
        type={allowText ? 'text' : 'url'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        disabled={busy}
      />
      <div className="image-field-actions">
        {url && !broken && (
          <span className={`image-field-thumb ${shape}`}>
            <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          </span>
        )}
        <button type="button" className="btn btn-sm" onClick={() => file.current?.click()} disabled={busy}>
          <Icon name="upload" size={14} /> {busy ? 'Uploading…' : 'Upload'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setPicking(true)} disabled={busy}>
          <Icon name="media" size={14} /> Library
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <ImageModal
        open={picking}
        pick
        onClose={() => setPicking(false)}
        onInsert={(_alt, picked) => {
          onChange(picked)
          setPicking(false)
        }}
      />
    </div>
  )
}
