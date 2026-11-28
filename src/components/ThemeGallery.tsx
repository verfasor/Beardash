import { useEffect, useState } from 'react'
import { Modal, SkeletonRows, useToast } from '../ui'
import { ThemePreview } from './ThemePreview'

// Bear Blog's built-in themes (a snapshot of the Themes page in Bear's dashboard). Like Bear's own picker,
// using one replaces the Theme CSS; here it only fills the editor, so nothing reaches Bear until you save.

export interface BearTheme {
  id: string
  title: string
  css: string
}

let themesPromise: Promise<BearTheme[]> | null = null
// Loaded on first open so the 175 KB of CSS isn't in the main bundle.
const loadThemes = () => (themesPromise ??= import('../data/bear-themes.json').then((m) => m.default as BearTheme[]))

/** A tiny colour sample from the theme's CSS variables, when it declares them. */
function swatch(css: string) {
  const v = (name: string) => {
    const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{3,8}|rgba?\\([^)]*\\)|[a-z]+)\\s*;`, 'i'))
    return m?.[1]
  }
  const bg = v('background-color')
  return bg ? { background: bg, color: v('text-color') ?? v('heading-color'), accent: v('link-color') } : null
}

export function ThemeGallery({
  open,
  onClose,
  onApply,
  subdomain,
}: {
  open: boolean
  onClose: () => void
  /** Gets the theme's CSS. The caller keeps the editor's current CSS in History first. */
  onApply: (css: string) => void | Promise<void>
  subdomain: string
}) {
  const toast = useToast()
  const [themes, setThemes] = useState<BearTheme[] | null>(null)
  const [picked, setPicked] = useState<BearTheme | null>(null)

  useEffect(() => {
    if (!open) return
    loadThemes()
      .then((t) => {
        setThemes(t)
        setPicked((p) => p ?? t[0] ?? null)
      })
      .catch(() => toast("Couldn't load the themes", 'error'))
  }, [open, toast])

  const use = async () => {
    if (!picked) return
    await onApply(picked.css)
    toast(`${picked.title} is in the editor. Save to put it on your blog.`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Bear themes"
      description="Bear Blog's built-in themes, shown on your own blog. Using one replaces the CSS in the editor. What you had is kept in History."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={use} disabled={!picked}>
            {picked ? `Use ${picked.title}` : 'Use theme'}
          </button>
        </>
      }
    >
      {!themes ? (
        <SkeletonRows count={6} />
      ) : (
        <div className="theme-gallery">
          <ul className="theme-gallery-list" role="listbox" aria-label="Themes">
            {themes.map((t) => {
              const s = swatch(t.css)
              return (
                <li key={t.id}>
                  <button type="button" role="option" aria-selected={picked?.id === t.id} className={picked?.id === t.id ? 'on' : ''} onClick={() => setPicked(t)}>
                    <span className="theme-swatch" style={s ? { background: s.background, color: s.color } : undefined} aria-hidden>
                      Aa
                      {s?.accent && <i style={{ background: s.accent }} />}
                    </span>
                    <span className="theme-name">{t.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="theme-gallery-preview">{picked && <ThemePreview css={picked.css} subdomain={subdomain} />}</div>
        </div>
      )}
    </Modal>
  )
}
