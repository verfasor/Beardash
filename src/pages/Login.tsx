import { useState } from 'react'
import { Logo } from '../ui'
import { ConnectBlogForm, type Connected } from '../components/ConnectBlogForm'
import { ImportBackupModal } from '../components/Security'

export function Login({
  onConnected,
  onRestored,
  initialSubdomain,
}: {
  onConnected: (r: Connected) => void
  onRestored: () => void
  initialSubdomain?: string
}) {
  const [restoring, setRestoring] = useState(false)
  return (
    <div className="login">
      <div className="login-inner">
        <div className="login-brand">
          <Logo size={16} />
          <span>Beardash</span>
        </div>
        <h1 className="login-title">Connect your Bear Blog</h1>
        <p className="login-sub">Write, edit and publish to Bear from a full editor. You can add more blogs once you're in.</p>
        <ConnectBlogForm onConnected={onConnected} initialSubdomain={initialSubdomain} />
        <p className="login-alt">
          Moving from another browser?{' '}
          <button className="text-link" onClick={() => setRestoring(true)}>
            Restore from a backup file
          </button>
        </p>
        <p className="login-note">
          Your API key stays in this browser. Beardash has no database and never stores it on a server; requests to Bear pass straight through. Not affiliated
          with Bear Blog.
        </p>
      </div>
      <ImportBackupModal
        open={restoring}
        onClose={() => setRestoring(false)}
        onImported={() => {
          setRestoring(false)
          onRestored()
        }}
      />
    </div>
  )
}
