import { useEffect, useRef, useState } from 'react'
import { vault } from '../vault'
import { Icon, Logo, Modal, SecretInput, SrAlert, shake, useConfirm, useToast } from '../ui'

const MIN_PASS = 8

// ---------- unlock screen ----------
export function UnlockScreen({ onUnlocked, onReset }: { onUnlocked: () => void; onReset: () => void }) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const passRef = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pass || busy) return
    setBusy(true)
    setError('')
    const ok = await vault.unlock(pass).catch(() => false)
    setBusy(false)
    if (ok) onUnlocked()
    else {
      setError("That passphrase didn't work")
      setPass('')
      if (passRef.current) passRef.current.value = ''
      passRef.current?.focus()
      shake(passRef.current)
    }
  }

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset Beardash in this browser?',
      body: "Without the passphrase, your saved API keys can't be decrypted. Resetting erases them, along with revision history and unsaved backups in this browser. Your blogs on Bear aren't affected. You can sign in again with your API keys, or restore a backup file.",
      confirm: 'Erase and start over',
      danger: true,
    })
    if (!ok) return
    await vault.eraseEverything()
    onReset()
  }

  return (
    <div className="login">
      <div className="login-inner">
        <div className="login-brand">
          <Logo size={16} />
          <span>Beardash</span>
        </div>
        <h1 className="login-title">Beardash is locked</h1>
        <p className="login-sub">Enter your passphrase to decrypt your API keys in this tab.</p>
        <form onSubmit={submit} className="stack" noValidate>
          <label className="field">
            <span className="label">Passphrase</span>
            <SecretInput
              ref={passRef}
              onValue={(v) => {
                setPass(v)
                if (error) setError('')
              }}
              placeholder={error || undefined}
              aria-invalid={!!error}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <SrAlert message={error} />
          <button className="btn btn-primary btn-lg btn-block" disabled={!pass || busy}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
        <p className="login-note">
          Forgot it?{' '}
          <button className="text-link" onClick={reset}>
            Reset Beardash in this browser
          </button>
        </p>
      </div>
    </div>
  )
}

// ---------- backup import (also used on the sign-in page) ----------
export function ImportBackupModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (r: { blogs: number; skipped: number; revisions: number }) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [pass, setPass] = useState('')
  const [error, setError] = useState<{ field: 'file' | 'pass'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const filePick = useRef<HTMLButtonElement>(null)
  const passRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setPass('')
      setError(null)
      setReplace(false)
    }
  }, [open])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!file || !pass || busy) return
    setBusy(true)
    setError(null)
    try {
      onImported(await vault.importBackup(await file.text(), pass, { replaceExisting: replace }))
    } catch (err) {
      const message = (err as Error).message.replace(/\.$/, '')
      if (/password/i.test(message)) {
        setError({ field: 'pass', message })
        setPass('')
        if (passRef.current) passRef.current.value = ''
        passRef.current?.focus()
        shake(passRef.current)
      } else {
        setError({ field: 'file', message })
        shake(filePick.current)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="sm"
      title="Restore from backup"
      description="Adds the blogs (and any history) from a Beardash backup file to this browser."
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => submit()} disabled={!file || !pass || busy}>
            {busy ? 'Decrypting…' : 'Restore'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="stack">
        <div className="field">
          <span className="label">Backup file</span>
          <button
            ref={filePick}
            type="button"
            className="file-pick"
            aria-invalid={error?.field === 'file'}
            onClick={() => input.current?.click()}
          >
            <Icon name={error?.field === 'file' ? 'alert' : 'file'} size={16} />
            <span>{error?.field === 'file' ? error.message : file ? file.name : 'Choose a .json backup…'}</span>
          </button>
          <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
            }}
          />
        </div>
        <label className="field">
          <span className="label">Backup password</span>
          <SecretInput
            key={open ? 'open' : 'closed'}
            ref={passRef}
            onValue={(v) => {
              setPass(v)
              if (error?.field === 'pass') setError(null)
            }}
            placeholder={error?.field === 'pass' ? error.message : undefined}
            aria-invalid={error?.field === 'pass'}
            autoComplete="off"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>
            Replace keys for blogs already connected here
            <small>Off by default, so a backup can't silently swap a key you're using.</small>
          </span>
        </label>
        <SrAlert message={error?.message ?? ''} />
        <button hidden />
      </form>
    </Modal>
  )
}

// ---------- keys & data ----------
type View = 'home' | 'set-pass' | 'export'

export function KeysDataModal({
  open,
  onClose,
  blogCount,
  onLockNow,
  onImported,
  onErased,
}: {
  open: boolean
  onClose: () => void
  blogCount: number
  onLockNow: () => void
  onImported: () => void
  onErased: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [view, setView] = useState<View>('home')
  const [lockOn, setLockOn] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [withHistory, setWithHistory] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setView('home')
    vault.lockEnabled().then(setLockOn)
  }, [open])
  useEffect(() => {
    setPass('')
    setPass2('')
  }, [view])

  const passError = pass && pass.length < MIN_PASS ? `Use at least ${MIN_PASS} characters.` : pass2 && pass !== pass2 ? "Passphrases don't match." : ''
  const passOk = pass.length >= MIN_PASS && pass === pass2

  const savePassphrase = async () => {
    if (!passOk) return
    setBusy(true)
    try {
      await vault.setPassphrase(pass)
      setLockOn(true)
      setView('home')
      toast(lockOn ? 'Passphrase changed' : 'Passphrase set. Keys are now encrypted.')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const removePassphrase = async () => {
    const ok = await confirm({
      title: 'Remove the passphrase?',
      body: "Your API keys will be stored unencrypted in this browser again, and Beardash won't ask for a passphrase.",
      confirm: 'Remove passphrase',
      danger: true,
    })
    if (!ok) return
    await vault.removePassphrase()
    setLockOn(false)
    toast('Passphrase removed')
  }

  const doExport = async () => {
    if (!passOk) return
    setBusy(true)
    try {
      const blob = await vault.exportBackup(pass, withHistory)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // beardash-backup-YYYY-MM-DD-xxxxxx.json: local date plus a short random suffix so same-day backups don't collide
      const seed = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6)
      a.download = `beardash-backup-${new Date().toLocaleDateString('en-CA')}-${seed}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setView('home')
      toast('Backup downloaded')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const erase = async () => {
    const ok = await confirm({
      title: 'Erase all Beardash data in this browser?',
      body: 'This removes every connected blog and API key, revision history, unsaved backups and the passphrase from this browser. Your blogs on Bear are not affected.',
      confirm: 'Erase everything',
      danger: true,
    })
    if (!ok) return
    await vault.eraseEverything()
    onErased()
  }

  const passFields = (label: string) => (
    <>
      <label className="field">
        <span className="label">{label}</span>
        <SecretInput onValue={setPass} autoComplete="new-password" autoFocus />
      </label>
      <label className="field">
        <span className="label">Confirm</span>
        <SecretInput onValue={setPass2} autoComplete="new-password" />
        {passError ? <small className="field-error">{passError}</small> : <small className="hint">At least {MIN_PASS} characters. It can't be recovered if you forget it.</small>}
      </label>
    </>
  )

  return (
    <>
      <Modal
        open={open && !importing}
        onClose={() => !busy && onClose()}
        size="md"
        title={view === 'set-pass' ? (lockOn ? 'Change passphrase' : 'Set a passphrase') : view === 'export' ? 'Export backup' : 'Keys & data'}
        description={
          view === 'home'
            ? 'Everything Beardash keeps lives in this browser only. Nothing is stored on a server.'
            : view === 'set-pass'
              ? "Your API keys will be encrypted with this passphrase. You'll enter it when you open Beardash."
              : 'Downloads an encrypted file with your connected blogs and keys. Use it to set up Beardash in another browser.'
        }
        footer={
          view === 'home' ? (
            <button className="btn" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setView('home')} disabled={busy}>
                Back
              </button>
              {view === 'set-pass' ? (
                <button className="btn btn-primary" onClick={savePassphrase} disabled={!passOk || busy}>
                  {busy ? 'Encrypting…' : lockOn ? 'Change passphrase' : 'Set passphrase'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={doExport} disabled={!passOk || busy}>
                  {busy ? 'Encrypting…' : 'Download backup'}
                </button>
              )}
            </>
          )
        }
      >
        {view === 'home' && (
          <div className="settings-list">
            <section className="setting-row">
              <div className="setting-text">
                <h3>
                  Passphrase lock <span className={`badge ${lockOn ? 'badge-on' : ''}`}>{lockOn ? 'On' : 'Off'}</span>
                </h3>
                <p>{lockOn ? 'API keys are encrypted. Beardash asks for the passphrase in each new tab.' : "Encrypt your API keys with a passphrase, so they're unreadable without it."} Revision history and drafts aren't encrypted.</p>
              </div>
              <div className="setting-actions">
                {lockOn ? (
                  <>
                    <button className="btn btn-sm" onClick={onLockNow}>
                      Lock now
                    </button>
                    <button className="btn btn-sm" onClick={() => setView('set-pass')}>
                      Change
                    </button>
                    <button className="btn btn-sm btn-danger-quiet" onClick={removePassphrase}>
                      Remove
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => setView('set-pass')}>
                    Set passphrase
                  </button>
                )}
              </div>
            </section>

            <section className="setting-row">
              <div className="setting-text">
                <h3>Backup</h3>
                <p>Move your {blogCount === 1 ? 'blog' : `${blogCount} blogs`} to another browser or device with an encrypted backup file.</p>
              </div>
              <div className="setting-actions">
                <button className="btn btn-sm" onClick={() => setView('export')}>
                  <Icon name="upload" size={14} /> Export
                </button>
                <button className="btn btn-sm" onClick={() => setImporting(true)}>
                  Import
                </button>
              </div>
            </section>

            <section className="setting-row">
              <div className="setting-text">
                <h3>Erase data</h3>
                <p>Remove all blogs, keys, history and backups from this browser.</p>
              </div>
              <div className="setting-actions">
                <button className="btn btn-sm btn-danger-quiet" onClick={erase}>
                  Erase…
                </button>
              </div>
            </section>
          </div>
        )}

        {view === 'set-pass' && <div className="stack">{passFields(lockOn ? 'New passphrase' : 'Passphrase')}</div>}

        {view === 'export' && (
          <div className="stack">
            {passFields('Backup password')}
            <label className="check">
              <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} />
              <span>
                Include revision history and unsaved backups
                <small>Makes the file larger. Your blogs and keys are always included.</small>
              </span>
            </label>
          </div>
        )}
      </Modal>

      <ImportBackupModal
        open={open && importing}
        onClose={() => setImporting(false)}
        onImported={(r) => {
          setImporting(false)
          toast(
            `Restored ${r.blogs} ${r.blogs === 1 ? 'blog' : 'blogs'}${r.revisions ? ` and ${r.revisions} revisions` : ''}${r.skipped ? `. Skipped ${r.skipped} already connected.` : ''}`,
          )
          onImported()
        }}
      />
    </>
  )
}
