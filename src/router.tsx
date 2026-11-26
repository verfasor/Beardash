import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'

// The app lives under /dashboard. App code uses short paths ("/posts"); the router adds and strips the base.
export const BASE = '/dashboard'
const toUrl = (appPath: string) => (appPath === '/' ? BASE : BASE + appPath.replace(/\/+$/, ''))
const fromUrl = (pathname: string) => {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname
  return p === '' ? '/' : p
}
export const href = (appPath: string) => toUrl(appPath)

type Nav = (to: string, opts?: { replace?: boolean }) => Promise<boolean>
const RouterCtx = createContext<{ path: string; search: string; navigate: Nav }>({
  path: '/',
  search: '',
  navigate: async () => false,
})

// Lets a page block navigation while there are unsaved changes (may show a modal).
let guard: (() => boolean | Promise<boolean>) | null = null
export function setNavigationGuard(fn: (() => boolean | Promise<boolean>) | null) {
  guard = fn
}

let currentUrl = location.pathname + location.search

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState({ path: fromUrl(location.pathname), search: location.search })

  useEffect(() => {
    const onPop = async () => {
      const next = location.pathname + location.search
      if (guard) {
        history.pushState(null, '', currentUrl) // stay put while we ask
        if (!(await guard())) return
        guard = null
        history.pushState(null, '', next)
      }
      currentUrl = next
      setLoc({ path: fromUrl(location.pathname), search: location.search })
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const navigate: Nav = useCallback(async (to, opts) => {
    if (guard && !(await guard())) return false
    guard = null
    const app = new URL(to, 'http://x') // resolve the app path + query
    const url = new URL(toUrl(app.pathname) + app.search, location.origin)
    if (opts?.replace) history.replaceState(null, '', url)
    else history.pushState(null, '', url)
    currentUrl = url.pathname + url.search
    setLoc({ path: app.pathname, search: app.search })
    window.scrollTo(0, 0)
    return true
  }, [])

  return <RouterCtx.Provider value={{ ...loc, navigate }}>{children}</RouterCtx.Provider>
}

export const useRouter = () => useContext(RouterCtx)

export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export function Link({ to, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter()
  const [path, query] = to.split('?')
  return (
    <a
      href={toUrl(path) + (query ? `?${query}` : '')}
      {...rest}
      onClick={(e) => {
        rest.onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
