import { createContext, useContext, useEffect, useState } from 'react'
import { bear, session as sessionApi, setKeyRejectedHandler, setCurrentBlog, type BlogInfo } from './api'
import { vault } from './vault'
import { UnlockScreen, KeysDataModal } from './components/Security'
import { ConnectBlogForm } from './components/ConnectBlogForm'
import { Router, useRouter, match, Link } from './router'
import { ToastProvider, ConfirmProvider, Icon, Logo, Modal, Kbd, MOD, useConfirm, useToast } from './ui'
import { BlogSwitcher, BlogAvatar } from './components/BlogSwitcher'
import { SidebarMenu } from './components/SidebarMenu'
import { ShortcutList } from './shortcuts'
import type { Connected } from './components/ConnectBlogForm'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { PostList } from './pages/PostList'
import { PostEditor } from './pages/PostEditor'
import { MediaLibrary } from './pages/MediaLibrary'
import { Settings } from './pages/Settings'
import { Themes } from './pages/Themes'
import { Docs } from './pages/Docs'

type Ctx = {
  /** The blog this tab is working on. */
  session: BlogInfo
  blogs: BlogInfo[]
  /** Update the current blog's info (e.g. its title), or pass null to sign out. */
  setSession: (s: BlogInfo | null) => void
  setBlogs: (b: BlogInfo[] | null) => void
  setActive: (subdomain: string) => void
  /** Re-read blogs from the browser vault (after import, etc.). */
  reload: () => Promise<void>
  /** Forget decrypted keys and show the unlock screen. */
  lock: () => void
}
const SessionCtx = createContext<Ctx | null>(null)
export const useSession = () => useContext(SessionCtx)!

export function blogUrl(s: BlogInfo) {
  return `https://${s.subdomain}.bearblog.dev/`
}

// Per-tab choice first (so two tabs can stay on different blogs), then the last one used anywhere.
const store = {
  get: () => {
    try {
      return sessionStorage.getItem('beardash-blog') || localStorage.getItem('beardash-last-blog') || ''
    } catch {
      return ''
    }
  },
  set: (sub: string) => {
    try {
      sessionStorage.setItem('beardash-blog', sub)
      localStorage.setItem('beardash-last-blog', sub)
    } catch {
      /* ignore */
    }
  },
}

// beardash.dev/<subdomain> lands here as /dashboard?add=<subdomain>. Read it once, then tidy the URL.
const pendingAdd = (() => {
  const params = new URLSearchParams(location.search)
  const sub = (params.get('add') ?? '').trim().toLowerCase()
  if (!params.has('add')) return null
  params.delete('add')
  const q = params.toString()
  history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash)
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub) ? sub : null
})()

type Theme = 'light' | 'dark' | 'system'
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('beardash-theme') as Theme) || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('beardash-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])
  return [theme, setTheme] as const
}

export function App() {
  const [phase, setPhase] = useState<'boot' | 'locked' | 'ready'>('boot')
  const [blogs, setBlogs] = useState<BlogInfo[] | null>(null)
  const [active, setActive] = useState(store.get)
  const [reconnect, setReconnect] = useState<string | null>(null)

  const reload = async () => {
    const r = await sessionApi.get()
    setBlogs(r.blogs.length ? r.blogs : null)
    setPhase('ready')
  }

  useEffect(() => {
    setKeyRejectedHandler((sub) => setReconnect(sub))
    vault
      .init()
      .then(({ locked }) => (locked ? setPhase('locked') : reload()))
      .catch(() => setPhase('ready'))
  }, [])

  const current = blogs?.find((b) => b.subdomain === active) ?? blogs?.[0]
  // Must be set before children render so their first requests target the right blog.
  if (current) setCurrentBlog(current.subdomain)
  useEffect(() => {
    if (current) store.set(current.subdomain)
  }, [current])

  const ctx: Ctx | null = current
    ? {
        session: current,
        blogs: blogs!,
        setBlogs,
        setActive,
        reload,
        lock: () => {
          vault.lock()
          setPhase('locked')
        },
        setSession: (s) => {
          if (!s) return setBlogs(null)
          setBlogs((list) => list?.map((b) => (b.subdomain === s.subdomain ? s : b)) ?? list)
        },
      }
    : null

  const reconnectBlog = blogs?.find((b) => b.subdomain === reconnect)

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router>
          {phase === 'boot' ? (
            <div className="boot" aria-busy="true" />
          ) : phase === 'locked' ? (
            <UnlockScreen onUnlocked={reload} onReset={() => reload()} />
          ) : !ctx ? (
            <Login
              initialSubdomain={pendingAdd ?? undefined}
              onConnected={(r) => {
                setActive(r.subdomain)
                setBlogs(r.blogs)
              }}
              onRestored={reload}
            />
          ) : (
            <SessionCtx.Provider value={ctx}>
              <Shell key={ctx.session.subdomain} />
            </SessionCtx.Provider>
          )}
          <Modal
            open={!!reconnectBlog}
            onClose={() => setReconnect(null)}
            size="sm"
            title={`Reconnect ${reconnectBlog?.blogTitle || reconnect}`}
            description="Bear rejected the saved API key. It may have been regenerated or revoked. Paste the current key to keep working."
            footer={
              <>
                <button className="btn" onClick={() => setReconnect(null)}>
                  Not now
                </button>
                <button className="btn btn-primary" type="submit" form="reconnect-form">
                  Reconnect
                </button>
              </>
            }
          >
            {reconnectBlog && (
              <ConnectBlogForm
                id="reconnect-form"
                showSubmit={false}
                fixedSubdomain={reconnectBlog.subdomain}
                onConnected={(r) => {
                  setBlogs(r.blogs)
                  setReconnect(null)
                }}
              />
            )}
          </Modal>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  )
}


// The shortcut is handled once per page load, even though Shell remounts when the blog changes.
let handledAdd = false

function Shell() {
  const { path, search, navigate } = useRouter()
  const { session, blogs, setSession, setBlogs, setActive, reload, lock } = useSession()
  const [keysOpen, setKeysOpen] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()
  const [theme, setTheme] = useTheme()
  const [navOpen, setNavOpen] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  useEffect(() => setNavOpen(false), [path])

  // Arrived via beardash.dev/<subdomain>: switch to it if connected, otherwise offer to add it.
  const [addRequest, setAddRequest] = useState<string | null>(null)
  useEffect(() => {
    const sub = pendingAdd
    if (!sub || handledAdd) return
    handledAdd = true
    const known = blogs.find((b) => b.subdomain === sub)
    if (!known) return setAddRequest(sub)
    if (sub !== session.subdomain) setActive(sub)
    toast(`Switched to ${known.blogTitle || sub}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Blogs connected before favicons were stored have none yet: fetch once (the Worker saves it too).
  useEffect(() => {
    if (session.favicon !== null && session.favicon !== undefined) return
    bear
      .getBlog()
      .then((b) => setSession({ ...session, blogTitle: b.title ?? session.blogTitle, favicon: b.favicon ?? '' }))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.subdomain])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '?' && !t.closest('input, textarea, [contenteditable], .cm-editor')) {
        e.preventDefault()
        setShortcuts(true)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  let page: React.ReactNode
  let m: Record<string, string> | null
  let isEditor = false
  if (path === '/') page = <Home />
  else if (path === '/posts') page = <PostList kind="post" />
  else if (path === '/pages') page = <PostList kind="page" />
  else if (path === '/posts/new') {
    page = <PostEditor key="new-post" uid={null} isPage={false} />
    isEditor = true
  } else if (path === '/pages/new') {
    page = <PostEditor key="new-page" uid={null} isPage />
    isEditor = true
  } else if ((m = match('/posts/:uid', path)) || (m = match('/pages/:uid', path))) {
    page = <PostEditor key={m.uid} uid={m.uid} isPage={path.startsWith('/pages')} />
    isEditor = true
  } else if (path === '/media') page = <MediaLibrary />
  else if (path === '/themes') page = <Themes />
  else if (path === '/settings') page = <Settings />
  else if (path === '/docs' || path === '/guide') page = <Docs />
  else
    page = (
      <div className="page">
        <h1 className="page-title">Page not found</h1>
        <p className="muted">
          <Link to="/">Go to overview</Link>
        </p>
      </div>
    )

  const nav = [
    { to: '/', label: 'Overview', icon: 'home' as const, active: path === '/' },
    { to: '/posts', label: 'Posts', icon: 'posts' as const, active: path.startsWith('/posts') },
    { to: '/pages', label: 'Pages', icon: 'pages' as const, active: path.startsWith('/pages') },
    { to: '/media', label: 'Media', icon: 'media' as const, active: path === '/media' },
    { to: '/themes', label: 'Themes', icon: 'palette' as const, active: path === '/themes' },
    { to: '/settings', label: 'Settings', icon: 'settings' as const, active: path === '/settings' },
    { to: '/docs', label: 'Docs', icon: 'info' as const, active: path === '/docs' || path === '/guide' },
  ]

  // Where to land after switching: stay on the same section, but leave an open post (it belongs to the old blog).
  const landingFor = () => (path.startsWith('/pages/') ? '/pages' : path.startsWith('/posts/') ? '/posts' : path + search)

  const switchBlog = async (sub: string) => {
    if (!(await navigate(landingFor(), { replace: true }))) return // unsaved changes: user chose to stay
    setActive(sub)
  }

  const connected = async (r: Connected) => {
    setBlogs(r.blogs)
    if (r.subdomain === session.subdomain) return toast('API key updated')
    if (await navigate(landingFor(), { replace: true })) {
      setActive(r.subdomain)
      toast(`Connected ${r.blogs.find((b) => b.subdomain === r.subdomain)?.blogTitle || r.subdomain}`)
    }
  }

  const removeBlog = async (b: BlogInfo) => {
    const name = b.blogTitle || b.subdomain
    const last = blogs.length === 1
    const ok = await confirm({
      title: `Disconnect ${name}?`,
      body: last
        ? "This is your only connected blog, so you'll be signed out. Nothing on Bear is changed."
        : "Beardash removes this blog's API key from this browser. Your blog and posts on Bear are not affected, and you can reconnect any time.",
      confirm: last ? 'Disconnect and sign out' : 'Disconnect',
      danger: true,
    })
    if (!ok) return
    const isCurrent = b.subdomain === session.subdomain
    if (isCurrent && !last && !(await navigate(landingFor(), { replace: true }))) return
    try {
      const r = await sessionApi.disconnect(b.subdomain)
      if (!r.blogs.length) return setSession(null)
      if (isCurrent) setActive(r.blogs[0].subdomain)
      setBlogs(r.blogs)
      toast(`Disconnected ${name}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const logout = async () => {
    const ok = await confirm({
      title: blogs.length > 1 ? 'Sign out of all blogs?' : 'Sign out of Beardash?',
      body:
        blogs.length > 1
          ? `This removes the API keys for all ${blogs.length} blogs from this browser. Revision history stays unless you erase it under Keys & data.`
          : 'This removes your API key from this browser. Revision history stays unless you erase it under Keys & data.',
      confirm: 'Sign out',
    })
    if (!ok) return
    await sessionApi.logout().catch(() => {})
    setSession(null)
  }

  return (
    <div className={`shell ${isEditor ? 'shell-editor' : ''} ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-head">
            <BlogSwitcher
              blogs={blogs}
              current={session}
              onSwitch={switchBlog}
              onConnected={connected}
              onRemove={removeBlog}
              addRequest={addRequest}
              onAddRequestSeen={() => setAddRequest(null)}
            />
            <button className="icon-btn nav-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
              <Icon name="x" />
            </button>
          </div>
          <Link to="/posts/new" className="btn btn-primary btn-block">
            <Icon name="plus" /> New post
          </Link>
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={`nav-item ${n.active ? 'active' : ''}`} aria-current={n.active ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SidebarMenu
            theme={theme}
            setTheme={setTheme}
            blogCount={blogs.length}
            onKeys={() => setKeysOpen(true)}
            onShortcuts={() => setShortcuts(true)}
            onLock={lock}
            onSignOut={logout}
          />
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        {!isEditor && (
          <div className="mobile-bar">
            <BlogAvatar blog={session} size={22} />
            <span className="mobile-title">{session.blogTitle || session.subdomain}</span>
            <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
          </div>
        )}
        {page}
      </main>
      <ShortcutsModal open={shortcuts} onClose={() => setShortcuts(false)} />
      <KeysDataModal
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        blogCount={blogs.length}
        onLockNow={() => {
          setKeysOpen(false)
          lock()
        }}
        onImported={() => reload()}
        onErased={() => {
          setKeysOpen(false)
          setSession(null)
        }}
      />
    </div>
  )
}

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="md">
      <ShortcutList />
      <p className="muted small">Paste or drop images into the editor to upload them to Bear.</p>
    </Modal>
  )
}
