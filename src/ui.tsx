import {
  forwardRef,
  type InputHTMLAttributes,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { LOGO_PATHS } from './logo-paths'

// ---------- modal ----------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocus,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  initialFocus?: string // CSS selector inside the modal
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first =
      (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) ||
      el?.querySelector<HTMLElement>('input:not([readonly]), textarea, select, [data-autofocus]') ||
      el?.querySelector<HTMLElement>('.modal-footer .btn-primary, .modal-footer .btn-danger') ||
      el
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])')]
        if (!items.length) return
        const [a, z] = [items[0], items[items.length - 1]]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open, initialFocus])

  if (!open) return null
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p className="modal-desc">{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {children !== undefined && <div className="modal-content">{children}</div>}
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

// ---------- confirm (promise-based, also callable outside React) ----------
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; cancel?: string; danger?: boolean }
let globalConfirm: ((o: ConfirmOpts) => Promise<boolean>) | null = null
export const confirmDialog = (o: ConfirmOpts) => globalConfirm?.(o) ?? Promise.resolve(window.confirm(o.title))

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(confirmDialog)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const ask = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) =>
        setState((prev) => {
          prev?.resolve(false)
          return { ...o, resolve }
        }),
      ),
    [],
  )
  useEffect(() => {
    globalConfirm = ask
    return () => {
      globalConfirm = null
    }
  }, [ask])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title}
        footer={
          <>
            <button className="btn" onClick={() => close(false)}>
              {state?.cancel ?? 'Cancel'}
            </button>
            <button className={`btn ${state?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
              {state?.confirm ?? 'Confirm'}
            </button>
          </>
        }
      >
        {state?.body && <div className="confirm-body">{state.body}</div>}
      </Modal>
    </ConfirmCtx.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmCtx)

// ---------- toasts ----------
type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++seq.current
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'error' ? <Icon name="alert" size={15} /> : t.kind === 'ok' ? <Icon name="check" size={15} /> : null}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ---------- dropdown menu ----------
export type MenuItem =
  | { label: string; onSelect: () => void; icon?: IconName; danger?: boolean; disabled?: boolean }
  | { label: string; href: string; icon?: IconName }
  | 'separator'

export function Menu({ items, label = 'More actions', align = 'end' }: { items: MenuItem[]; label?: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const els = [...(root.current?.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') ?? [])]
        const i = els.indexOf(document.activeElement as HTMLElement)
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    root.current?.querySelector<HTMLElement>('.menu-item')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="menu-root" ref={root}>
      <button className={`icon-btn ${open ? 'on' : ''}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className={`menu menu-${align}`} role="menu">
          {items.map((it, i) =>
            it === 'separator' ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : 'href' in it ? (
              <a key={i} className="menu-item" role="menuitem" href={it.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                {it.icon && <Icon name={it.icon} size={15} />}
                {it.label}
              </a>
            ) : (
              <button
                key={i}
                className={`menu-item ${it.danger ? 'danger' : ''}`}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
              >
                {it.icon && <Icon name={it.icon} size={15} />}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ---------- inline field errors (no layout shift) ----------
/** Briefly shake a field to signal an error. Skipped when the user prefers reduced motion. */
export function shake(el: Element | null | undefined) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
    { duration: 360, easing: 'ease-in-out' },
  )
}

/** Announces a message to screen readers without taking up any space. */
export function SrAlert({ message }: { message: string }) {
  return (
    <span className="sr-only" role="alert" aria-live="assertive">
      {message}
    </span>
  )
}

// ---------- secret input ----------
/**
 * Password/API-key field that is deliberately *uncontrolled*: React copies a controlled input's value
 * into its `value` HTML attribute, which CSS selectors can read. Read the value via onValue instead.
 */
export const SecretInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'type' | 'onChange'> & { onValue: (v: string) => void }
>(function SecretInput({ onValue, ...rest }, ref) {
  return <input ref={ref} type="password" spellCheck={false} autoCapitalize="none" {...rest} onChange={(e) => onValue(e.target.value)} />
})

// ---------- small bits ----------
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  )
}

// ---------- skeletons (match final layout so nothing shifts) ----------
export function Skel({ w, h = 12, r, className = '' }: { w?: number | string; h?: number | string; r?: number; className?: string }) {
  return <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden />
}

// Deterministic "random" widths so skeletons look natural but don't jump between renders.
const WIDTHS = [62, 45, 78, 54, 70, 38, 66, 50, 74, 58]
export const skelWidth = (i: number, base = 1) => `${WIDTHS[i % WIDTHS.length] * base}%`

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <ul className="rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="row-link skel-row">
            <Skel w={skelWidth(i)} h={13} />
            <Skel w={56} h={11} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = { published: 'Published', draft: 'Draft', scheduled: 'Scheduled', new: 'New' }
export function Status({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
/** Relative time. Numbers are unix seconds; pass a Date for milliseconds. */
export function relTime(input: string | number | Date | null | undefined) {
  if (!input) return ''
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input)
  const diff = (d.getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'just now'
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2629800],
    ['year', 31557600],
  ]
  let unit: Intl.RelativeTimeFormatUnit = 'minute'
  let size = 60
  for (const [u, s] of units) if (abs >= s) [unit, size] = [u, s]
  return rtf.format(Math.round(diff / size), unit)
}

/** Short date. The year is left off for this year unless `alwaysYear` is set (the posts and pages lists). */
export function fmtDate(input: string | null | undefined, withTime = false, alwaysYear = false) {
  if (!input) return ''
  const d = new Date(input)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    year: sameYear && !alwaysYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

export function copy(text: string, toast: (t: string, k?: 'ok' | 'error' | 'info') => void, label = 'Copied') {
  navigator.clipboard.writeText(text).then(
    () => toast(label),
    () => toast('Could not copy to clipboard', 'error'),
  )
}

/** Beardash's pixel-bear mark, drawn in the current text colour. Multiples of 16px render pixel-perfect. */
export function Logo({ size = 16 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      {LOGO_PATHS.map(([d, t], i) => (
        <path key={i} d={d} transform={t || undefined} />
      ))}
    </svg>
  )
}

export type IconName = keyof typeof ICONS
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  )
}

const ICONS = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  posts: (
    <>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5M9 13h6M9 16.5h4" />
    </>
  ),
  pages: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <path d="M4 9h16" />
    </>
  ),
  media: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9.5" cy="9.5" r="1.5" />
      <path d="m20 15-4.5-4.5L6 20" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  external: <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />,
  trash: <path d="M5 7h14M10 11v5M14 11v5M7 7l.8 12h8.4L17 7M9.5 7V4.5h5V7" />,
  copy: (
    <>
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m19 19-3.5-3.5" />
    </>
  ),
  back: <path d="M15 18l-6-6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6z" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  chevronsUpDown: <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
      <path d="M4 4.5v4h4M12 8v4l2.5 2.5" />
    </>
  ),
  panel: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="14.5" cy="7.5" r="1" />
    </>
  ),
  eye: (
    <>
      <path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  upload: <path d="M12 15V5M8 9l4-4 4 4M5 15v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />,
  file: (
    <>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5" />
    </>
  ),
  logout: <path d="M10 20H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4M15 16l4-4-4-4M19 12H10" />,
  moon: <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v1.5M12 19.5V21M5.6 5.6l1 1M17.4 17.4l1 1M3 12h1.5M19.5 12H21M5.6 18.4l1-1M17.4 6.6l1-1" />
    </>
  ),
  monitor: (
    <>
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  focus: <path d="M4 9V5h4M16 4h4v4M20 15v4h-4M8 20H4v-4" />,
  link: <path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-.7.7M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l.7-.7" />,
  image: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9.5" cy="9.5" r="1.5" />
      <path d="m20 15-4.5-4.5L6 20" />
    </>
  ),
  code: <path d="m15.5 17 5-5-5-5M8.5 7l-5 5 5 5" />,
  codeBlock: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m10 10-2 2 2 2M14 10l2 2-2 2" />
    </>
  ),
  quote: <path d="M8 7H5.5v5H9v1c0 2-1.5 3-3 3.5M18 7h-2.5v5H19v1c0 2-1.5 3-3 3.5" />,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  olist: <path d="M10 6.5h10M10 12h10M10 17.5h10M4 5l1.5-1v5M4 14.5h3l-3 3.5h3" />,
  divider: <path d="M4 12h16" />,
  table: <path d="M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 5.5v13" />,
  check: <path d="M5 12.5 10 17 19 7.5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 16h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M17 7 7 17M7 7l10 10" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  send: <path d="M5 12h12M13 7l5 5-5 5" />,
  bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
  italic: <path d="M14 5h-4M14 19h-4M14 5l-4 14" />,
  strike: <path d="M5 12h14M16 7.5C15.5 6 14 5 12 5c-2.5 0-4 1.3-4 3 0 1.3.8 2.2 2.5 2.8M8 16.5c.5 1.5 2 2.5 4 2.5 2.5 0 4-1.3 4-3 0-.6-.2-1.2-.5-1.6" />,
}
