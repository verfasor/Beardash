import { useEffect, useRef, useState } from 'react'
import { vault } from '../vault'
import { canInstall, onInstallChange, promptInstall } from '../pwa'
import { Icon, Kbd, Logo, type IconName } from '../ui'

type Theme = 'light' | 'dark' | 'system'

// Set by the Worker from Cloudflare's version metadata (see worker/index.ts); "dev" when running locally.
const BUILD = document.querySelector<HTMLMetaElement>('meta[name="beardash-version"]')?.content || (import.meta.env.DEV ? 'dev' : '')
// The exact commit this build came from (set when Cloudflare builds from GitHub), else the repo.
const SOURCE = document.querySelector<HTMLMetaElement>('meta[name="beardash-source"]')?.content || 'https://github.com/verfasor/Beardash'
const THEMES: { key: Theme; label: string; icon: IconName }[] = [
  { key: 'system', label: 'System', icon: 'monitor' },
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
]

/** The "⋯" menu at the bottom of the sidebar: app-level actions, theme and sign-out. */
export function SidebarMenu({
  theme,
  setTheme,
  blogCount,
  onKeys,
  onShortcuts,
  onLock,
  onSignOut,
}: {
  theme: Theme
  setTheme: (t: Theme) => void
  blogCount: number
  onKeys: () => void
  onShortcuts: () => void
  onLock: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<'main' | 'appearance'>('main')
  const [lockOn, setLockOn] = useState(false)
  const [installable, setInstallable] = useState(canInstall)
  useEffect(() => {
    const off = onInstallChange(() => setInstallable(canInstall()))
    return () => {
      off()
    }
  }, [])
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setPanel('main')
    vault.lockEnabled().then(setLockOn, () => setLockOn(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (panel === 'appearance') setPanel('main')
        else {
          setOpen(false)
          trigger.current?.focus()
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = [...(root.current?.querySelectorAll<HTMLElement>('.app-menu [data-item]') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    root.current?.querySelector<HTMLElement>('.app-menu [data-item]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, panel])

  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  const current = THEMES.find((t) => t.key === theme)!

  return (
    <div className="app-menu-root" ref={root}>
      <button
        ref={trigger}
        className={`app-menu-trigger ${open ? 'open' : ''}`}
        aria-label="Beardash menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="wordmark">
          <Logo size={16} />
          Beardash
          <span className="build" title="Build">{BUILD}</span>
        </span>
        <Icon name="more" />
      </button>

      {open && (
        <div className="app-menu" role="menu">
          {panel === 'main' ? (
            <>
              <div className="app-menu-head">
                <span className="app-menu-title">
                  <Logo size={16} />
                  Beardash
                </span>
                <span className="app-menu-sub">
                  {blogCount} {blogCount === 1 ? 'blog' : 'blogs'} · keys {lockOn ? 'encrypted' : 'stored locally'}
                </span>
              </div>
              <div className="app-menu-sep" />
              <button data-item role="menuitem" className="app-menu-item" onClick={run(onKeys)}>
                <Icon name="shield" />
                <span>Keys &amp; data</span>
              </button>
              <button data-item role="menuitem" className="app-menu-item" onClick={run(onShortcuts)}>
                <Icon name="keyboard" />
                <span>Shortcuts</span>
                <span className="app-menu-aside">
                  <Kbd>?</Kbd>
                </span>
              </button>
              <button data-item role="menuitem" aria-haspopup="menu" className="app-menu-item" onClick={() => setPanel('appearance')}>
                <Icon name={current.icon} />
                <span>Appearance</span>
                <span className="app-menu-aside">
                  {current.label}
                  <Icon name="chevronRight" size={14} />
                </span>
              </button>
              {installable && (
                <button data-item role="menuitem" className="app-menu-item" onClick={run(() => promptInstall())}>
                  <Icon name="download" />
                  <span>Install app</span>
                </button>
              )}
              {lockOn && (
                <button data-item role="menuitem" className="app-menu-item" onClick={run(onLock)}>
                  <Icon name="lock" />
                  <span>Lock now</span>
                </button>
              )}
              <a data-item role="menuitem" className="app-menu-item" href={SOURCE} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Icon name="code" />
                <span>Source code</span>
                <span className="app-menu-aside">{BUILD}</span>
              </a>
              <div className="app-menu-sep" />
              <button data-item role="menuitem" className="app-menu-item" onClick={run(onSignOut)}>
                <Icon name="logout" />
                <span>{blogCount > 1 ? 'Sign out of all blogs' : 'Sign out'}</span>
              </button>
            </>
          ) : (
            <>
              <button data-item className="app-menu-item app-menu-back" onClick={() => setPanel('main')}>
                <Icon name="back" />
                <span>Appearance</span>
              </button>
              <div className="app-menu-sep" />
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  data-item
                  role="menuitemradio"
                  aria-checked={theme === t.key}
                  className="app-menu-item"
                  onClick={() => setTheme(t.key)}
                >
                  <Icon name={t.icon} />
                  <span>{t.label}</span>
                  {theme === t.key && (
                    <span className="app-menu-aside">
                      <Icon name="check" size={15} />
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
