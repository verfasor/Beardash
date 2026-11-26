// PWA: register the service worker and capture the browser's install prompt so the app can offer
// its own "Install app" button (Chrome/Edge fire `beforeinstallprompt`; Safari uses Add to Home Screen).

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function canInstall() {
  return !!deferred && !isInstalled()
}

export function onInstallChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function promptInstall() {
  if (!deferred) return false
  const e = deferred
  deferred = null
  emit()
  await e.prompt()
  return (await e.userChoice).outcome === 'accepted'
}

// The page enforces Trusted Types, which also covers service-worker script URLs. This policy
// approves exactly one URL, /sw.js, and nothing else (it's named in the CSP's trusted-types list).
type TT = { createPolicy: (name: string, rules: { createScriptURL: (u: string) => string }) => { createScriptURL: (u: string) => unknown } }
function swUrl(): unknown {
  const tt = (globalThis as { trustedTypes?: TT }).trustedTypes
  if (!tt) return '/sw.js'
  const policy = tt.createPolicy('beardash-sw', {
    createScriptURL: (u) => {
      if (u !== '/sw.js') throw new TypeError('Blocked script URL')
      return u
    },
  })
  return policy.createScriptURL('/sw.js')
}

export function setupPwa() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own button
    deferred = e as InstallEvent
    emit()
  })
  addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    addEventListener('load', () => {
      // Retire the earlier '/dashboard/' registration (it didn't cover the slash-less /dashboard).
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.filter((r) => new URL(r.scope).pathname === '/dashboard/').forEach((r) => r.unregister()))
        .catch(() => {})
      navigator.serviceWorker.register(swUrl() as unknown as string, { scope: '/dashboard' }).catch(() => {})
    })
  }
}
