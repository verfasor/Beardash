import './trusted-types'
import { setupPwa } from './pwa'

// The project used to be called Mishka: carry over saved preferences once.
for (const store of [localStorage, sessionStorage]) {
  try {
    for (const k of ['theme', 'view', 'blog', 'last-blog']) {
      const old = store.getItem(`mishka-${k}`)
      if (old !== null) {
        if (store.getItem(`beardash-${k}`) === null) store.setItem(`beardash-${k}`, old)
        store.removeItem(`mishka-${k}`)
      }
    }
  } catch {
    /* storage unavailable */
  }
}
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
