// Beardash's only server code: a stateless pass-through to the Bear API.
//
// Bear's API doesn't allow direct browser requests (no CORS), so the browser sends each request
// here with the API key in a header, and this Worker forwards it to bearblog.dev. Nothing is stored,
// cached or logged: no database, no cookies, no secrets.

import { Hono } from 'hono'

type Env = {
  BEAR_ORIGIN?: string // override for local testing against a mock
  LIMITER?: RateLimit // Cloudflare rate limiting (per client IP); counters live at Cloudflare, not in Beardash
  ASSETS: Fetcher // the built site (landing page, dashboard shell, bundles)
  CF_VERSION_METADATA?: WorkerVersionMetadata // this deploy's id + upload time, used as the build number
}

const DEFAULT_BEAR_ORIGIN = 'https://bearblog.dev'
const MAX_BODY_BYTES = 11 * 1024 * 1024 // Bear's upload limit is 10 MB; leave room for multipart overhead

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const BEAR_PATH_RE = /^(post|blog|media)\/(?:[A-Za-z0-9_-]+\/)?$/

const app = new Hono<{ Bindings: Env }>().basePath('/api')

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
}

app.onError((err, c) => {
  // Never log request details: headers carry the user's API key.
  const network = /network|tls|connect/i.test(String(err))
  return c.json({ error: network ? "Couldn't reach Bear. Try again in a moment." : 'Something went wrong.' }, network ? 502 : 500)
})

app.use('*', async (c, next) => {
  // Applied to every response, including early rejections below.
  try {
    // Only Beardash's own page can call this: a custom header forces a CORS preflight, which we never approve.
    if (c.req.header('x-beardash') !== '1') {
      c.res = c.json({ error: 'Missing X-Beardash header' }, 403)
      return
    }
    // Stops the pass-through being used as a free relay at volume (Bear allows 60 requests a minute per key).
    if (c.env.LIMITER) {
      const ip = c.req.header('cf-connecting-ip') ?? 'local'
      const { success } = await c.env.LIMITER.limit({ key: ip })
      if (!success) {
        c.res = c.json({ error: 'Too many requests. Try again in a minute.' }, 429, { 'Retry-After': '60' })
        return
      }
    }
    await next()
  } finally {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v)
  }
})

// /api/bear/<subdomain>/<post|blog|media>/[id/]
app.all('/bear/:subdomain/*', async (c) => {
  const subdomain = c.req.param('subdomain')
  const path = c.req.path.replace(/^\/api\/bear\/[^/]+\//, '')
  if (!SUBDOMAIN_RE.test(subdomain) || !BEAR_PATH_RE.test(path)) return c.json({ error: 'Unknown Bear endpoint' }, 404)

  const method = c.req.method
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return c.json({ error: 'Method not allowed' }, 405)

  const apiKey = c.req.header('x-bear-key') ?? ''
  if (!apiKey || apiKey.length > 512) return c.json({ error: 'Missing API key', code: 'no_key' }, 401)

  const url = new URL(`${c.env.BEAR_ORIGIN || DEFAULT_BEAR_ORIGIN}/${subdomain}/api/v1/${path}`)
  url.search = new URL(c.req.url).search

  const headers = new Headers({ Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'User-Agent': 'Beardash (Bear Blog editor)' })
  let body: ArrayBuffer | undefined
  if (method === 'POST' || method === 'PATCH') {
    // Require a declared length so oversized bodies are refused before being read into memory.
    const declared = Number(c.req.header('content-length'))
    if (!Number.isFinite(declared) || declared <= 0) return c.json({ error: 'Content-Length required' }, 411)
    if (declared > MAX_BODY_BYTES) return c.json({ error: "File is larger than Bear's 10 MB limit." }, 413)
    body = await c.req.arrayBuffer()
    if (body.byteLength > MAX_BODY_BYTES) return c.json({ error: "File is larger than Bear's 10 MB limit." }, 413)
    const ct = c.req.header('content-type')
    if (ct) headers.set('Content-Type', ct)
  }

  const res = await fetch(url, { method, headers, body, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) return c.json({ error: `Unexpected redirect from Bear (${res.status})` }, 502)

  const out = new Headers()
  for (const h of ['content-type', 'retry-after']) {
    const v = res.headers.get(h)
    if (v) out.set(h, v)
  }
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out })
})

// /api/page/<subdomain>?path=/blog/ : a public page of the blog, for the Theme CSS preview.
// Read-only and keyless: no API key is involved, and the HTML is returned as text, never stored.
// The browser renders it in a sandboxed frame with the blog's own CSS and scripts stripped.
const PAGE_PATH_RE = /^\/(?!\/)[A-Za-z0-9\-._~%/]*(?:\?[A-Za-z0-9\-._~%=&+]*)?$/
const MAX_PAGE_BYTES = 3 * 1024 * 1024

app.get('/page/:subdomain', async (c) => {
  const subdomain = c.req.param('subdomain')
  const path = c.req.query('path') || '/'
  if (!SUBDOMAIN_RE.test(subdomain) || path.length > 512 || !PAGE_PATH_RE.test(path)) return c.json({ error: 'Unknown page' }, 404)

  const res = await fetch(`https://${subdomain}.bearblog.dev${path}`, {
    // Bear turns away requests that don't look like a browser.
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Beardash',
      Accept: 'text/html',
    },
    redirect: 'follow',
  })
  if (!new URL(res.url).protocol.startsWith('https')) return c.json({ error: 'Unexpected redirect' }, 502)
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return c.json({ error: "That page isn't HTML." }, 502)
  if (Number(res.headers.get('content-length')) > MAX_PAGE_BYTES) return c.json({ error: 'That page is too large to preview.' }, 502)
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > MAX_PAGE_BYTES) return c.json({ error: 'That page is too large to preview.' }, 502)
  const html = new TextDecoder().decode(bytes)
  // The final URL (after any redirect, e.g. to a custom domain) is where relative links resolve.
  return c.json({ status: res.status, url: res.url, html })
})

app.all('*', (c) => c.json({ error: 'Not found' }, 404))

// The dashboard is a single-page app at /dashboard/…: every path under it gets the same HTML shell.
// Its strict security headers are set here explicitly (they mirror public/_headers) so they apply
// no matter how the asset is served.
const DASHBOARD_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types default dompurify beardash-sw",
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-cache',
}

declare const __BUILD_COMMIT__: string
const REPO = 'https://github.com/verfasor/Beardash'
const COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : ''

/**
 * The build number shown on the site.
 * Built by Cloudflare from GitHub: the short commit hash, linked to that commit, so anyone can check
 * that beardash.dev runs that exact code. Deployed from a laptop: "b" + the start of Cloudflare's
 * version id, with no link, so it never claims a commit it didn't come from.
 */
function buildInfo(env: Env) {
  if (COMMIT) return { label: COMMIT.slice(0, 7), url: `${REPO}/commit/${COMMIT}` }
  const id = env.CF_VERSION_METADATA?.id
  return { label: id ? `b${id.replace(/[^a-f0-9]/gi, '').slice(0, 6).toLowerCase()}` : '', url: '' }
}

// Same security headers as the dashboard, minus noindex: the landing page should be indexed.
const { 'X-Robots-Tag': _noindex, ...LANDING_HEADERS } = DASHBOARD_HEADERS

/**
 * "Schedule a post for Friday morning": a day two days ahead in the visitor's own timezone
 * (Cloudflare tells us it), so the example always points at their near future.
 */
function scheduleExample(timeZone: unknown, now = Date.now()) {
  let tz = typeof timeZone === 'string' && timeZone ? timeZone : 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const day = new Date(now + 2 * 86_400_000)
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(day),
    date: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(day),
  }
}

/** The landing page is static; stamp the build number and the scheduling example in as it's served. */
async function landing(req: Request, env: Env) {
  const asset = await env.ASSETS.fetch(req)
  if (!asset.ok || !(asset.headers.get('content-type') ?? '').includes('text/html')) return asset
  const build = buildInfo(env)
  const buildTag = build.url
    ? `<a class="top-build" href="${build.url}" rel="noopener" title="The commit this build came from">${build.label}</a>`
    : `<span class="top-build">${build.label}</span>`
  const when = scheduleExample((req as Request & { cf?: { timezone?: string } }).cf?.timezone)
  const html = (await asset.text())
    .replace('<span class="top-build"></span>', buildTag)
    .replace(/<span class="sched-day">[^<]*<\/span>/, `<span class="sched-day">${when.weekday}</span>`)
    .replace(/<span class="sched-date">[^<]*<\/span>/, `<span class="sched-date">${when.date}</span>`)
  const res = new Response(html, { status: asset.status, headers: asset.headers })
  res.headers.delete('content-length')
  for (const [k, v] of Object.entries(LANDING_HEADERS)) res.headers.set(k, v)
  return res
}

async function dashboard(req: Request, env: Env) {
  const url = new URL(req.url)
  // Canonical URLs have no trailing slash: /dashboard/ → /dashboard, /dashboard/posts/ → /dashboard/posts
  if (url.pathname.endsWith('/')) return Response.redirect(new URL(url.pathname.replace(/\/+$/, '') + url.search, url).toString(), 308)
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  // internal fetch of the built file (dashboard/index.html); visitors never see this path
  const shell = await env.ASSETS.fetch(new Request(new URL('/dashboard/', url), { method: req.method, headers: { Accept: 'text/html' } }))
  // Stamp the build number into the page: "b" + the first 6 characters of the Cloudflare version id
  let html = await shell.text()
  const build = buildInfo(env)
  if (build.label) {
    const source = build.url ? `\n    <meta name="beardash-source" content="${build.url}" />` : ''
    html = html.replace('</head>', `<meta name="beardash-version" content="${build.label}" />${source}\n  </head>`)
  }
  const res = new Response(html, { status: shell.ok ? 200 : shell.status, headers: shell.headers })
  res.headers.delete('content-length')
  for (const [k, v] of Object.entries(DASHBOARD_HEADERS)) res.headers.set(k, v)
  return res
}

// beardash.dev/<subdomain> is a shortcut: it opens the dashboard with that blog filled in.
// Real files and routes always win: this only applies when nothing else exists at the path.
const SHORTCUT = /^\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\/?$/i
const RESERVED = new Set(['api', 'dashboard', 'assets', 'icons', 'preview-frame', 'theme-frame', 'index', '404'])

async function other(req: Request, env: Env) {
  const url = new URL(req.url)
  const asset = await env.ASSETS.fetch(req)
  const m = url.pathname.match(SHORTCUT)
  const sub = m?.[1].toLowerCase()
  if (asset.status === 404 && sub && !RESERVED.has(sub) && (req.method === 'GET' || req.method === 'HEAD')) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard?add=${sub}`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
    })
  }
  // Everything else is exactly what the static assets would serve (the 404 page, legacy redirects…).
  if (!(asset.headers.get('content-type') ?? '').includes('text/html')) return asset
  const res = new Response(asset.body, asset)
  for (const [k, v] of Object.entries(LANDING_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v)
  return res
}

export default {
  fetch(req, env, ctx) {
    const { pathname, protocol, host } = new URL(req.url)
    // Force HTTPS (.dev is HSTS-preloaded in browsers anyway; this covers every other client).
    if (protocol === 'http:' && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
      const to = new URL(req.url)
      to.protocol = 'https:'
      return Response.redirect(to.toString(), 301)
    }
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return dashboard(req, env)
    if (pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) return landing(req, env)
    if (pathname.startsWith('/api/')) return app.fetch(req, env, ctx)
    return other(req, env)
  },
} satisfies ExportedHandler<Env>
