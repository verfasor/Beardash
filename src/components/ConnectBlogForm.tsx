import { useRef, useState } from 'react'
import { session, type BlogInfo } from '../api'
import { SecretInput, SrAlert, shake } from '../ui'

export type Connected = { subdomain: string; blogs: BlogInfo[] }

/** Subdomain + API key form. Used on the sign-in page and in the “Add blog” modal. */
export function ConnectBlogForm({
  id,
  onConnected,
  onBusyChange,
  submitLabel = 'Continue',
  showSubmit = true,
  fixedSubdomain,
  initialSubdomain,
}: {
  fixedSubdomain?: string
  /** Prefilled but editable (from the beardash.dev/<subdomain> shortcut). The API key field gets focus. */
  initialSubdomain?: string
  id?: string
  onConnected: (r: Connected) => void
  onBusyChange?: (busy: boolean) => void
  submitLabel?: string
  showSubmit?: boolean
}) {
  const [subdomain, setSubdomain] = useState(fixedSubdomain ?? initialSubdomain ?? '')
  const [apiKey, setApiKey] = useState('')
  // Errors appear inside the field they're about (or in the hint line), never as a new row: no layout shift.
  const [error, setError] = useState<{ field: 'subdomain' | 'key' | 'general'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const subRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subdomain.trim() || !apiKey.trim() || busy) return
    setBusy(true)
    onBusyChange?.(true)
    setError(null)
    try {
      onConnected(await session.connect(subdomain, apiKey))
    } catch (err) {
      const message = (err as Error).message.replace(/\.$/, '')
      if (/subdomain/i.test(message) && !fixedSubdomain) {
        // short enough to fit inside the subdomain field next to ".bearblog.dev"
        const short = /found/i.test(message) ? 'Blog not found' : /look like/i.test(message) ? 'Not a valid subdomain' : message
        setError({ field: 'subdomain', message: short })
        setSubdomain('')
        subRef.current?.focus()
        shake(subRef.current?.parentElement)
      } else if (/api key|upgraded/i.test(message)) {
        setError({ field: 'key', message })
        setApiKey('')
        if (keyRef.current) keyRef.current.value = ''
        keyRef.current?.focus()
        shake(keyRef.current)
      } else {
        setError({ field: 'general', message })
      }
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <form id={id} onSubmit={submit} className="stack" noValidate>
      <label className="field">
        <span className="label">Subdomain</span>
        <div className="input-group">
          <input
            ref={subRef}
            value={subdomain}
            onChange={(e) => {
              setSubdomain(e.target.value)
              if (error?.field === 'subdomain') setError(null)
            }}
            placeholder={error?.field === 'subdomain' ? error.message : 'yourblog'}
            aria-invalid={error?.field === 'subdomain'}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus={!fixedSubdomain && !initialSubdomain}
            readOnly={!!fixedSubdomain}
          />
          <span className="input-suffix">.bearblog.dev</span>
        </div>
      </label>
      <label className="field">
        <span className="label">API key</span>
        <SecretInput
          ref={keyRef}
          onValue={(v) => {
            setApiKey(v)
            if (error?.field === 'key' || error?.field === 'general') setError(null)
          }}
          placeholder={error?.field === 'key' ? error.message : undefined}
          aria-invalid={error?.field === 'key'}
          autoComplete="off"
          required
          autoFocus={!!fixedSubdomain || !!initialSubdomain}
        />
        <small className={`hint hint-slot ${error?.field === 'general' ? 'is-error' : ''}`}>
          {error?.field === 'general'
            ? error.message + '.'
            : 'Create one in Bear under Settings → API. Each blog has its own key and needs an upgraded plan. The key is kept only in this browser.'}
        </small>
      </label>
      <SrAlert message={error?.message ?? ''} />
      {showSubmit ? (
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !subdomain || !apiKey}>
          {busy ? 'Checking key…' : submitLabel}
        </button>
      ) : (
        <button hidden />
      )}
    </form>
  )
}
