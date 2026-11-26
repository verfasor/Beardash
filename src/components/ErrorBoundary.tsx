import { Component, type ReactNode } from 'react'
import { vault } from '../vault'

/**
 * Last line of defence: if anything throws while rendering (for example corrupted local data),
 * show a recovery screen instead of a blank page that would need devtools to fix.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; confirming: boolean }> {
  state = { error: null as Error | null, confirming: false }

  static getDerivedStateFromError(error: Error) {
    return { error, confirming: false }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="login">
        <div className="login-inner">
          <h1 className="login-title">Something went wrong</h1>
          <p className="login-sub">Beardash hit an error it couldn't recover from. Reloading usually fixes it.</p>
          <div className="stack">
            <button className="btn btn-primary btn-lg btn-block" onClick={() => location.reload()}>
              Reload
            </button>
            {this.state.confirming ? (
              <button
                className="btn btn-danger btn-lg btn-block"
                onClick={async () => {
                  await vault.eraseEverything().catch(() => indexedDB.deleteDatabase('beardash'))
                  location.reload()
                }}
              >
                Yes, erase Beardash data in this browser
              </button>
            ) : (
              <button className="btn btn-lg btn-block" onClick={() => this.setState({ confirming: true })}>
                Still broken? Erase local data…
              </button>
            )}
          </div>
          <p className="login-note">
            Erasing removes connected blogs, keys, revision history and drafts from this browser only. Your blogs on Bear are not affected.
          </p>
        </div>
      </div>
    )
  }
}
