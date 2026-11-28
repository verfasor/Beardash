import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// In production the Worker serves the dashboard shell for every /dashboard/* path. In dev that
// bypasses Vite's HTML transform (React refresh preamble, module graph), so serve it here instead.
// Single-word paths that are real routes in dev (Vite internals, legacy redirects), never blog shortcuts.
const DEV_RESERVED = new Set(['api', 'dashboard', 'assets', 'icons', 'preview-frame', 'theme-frame', 'index', '404', 'src', 'node_modules', 'posts', 'pages', 'media', 'settings', 'guide'])

function dashboardDevShell(): Plugin {
  return {
    name: 'beardash-dashboard-dev-shell',
    apply: 'serve',
    // the landing page's build number is stamped by the Worker in production; show "dev" locally
    transformIndexHtml: (html) => {
      // same stamping as the Worker in production, using this machine's timezone
      const day = new Date(Date.now() + 2 * 86_400_000)
      const weekday = day.toLocaleDateString('en-US', { weekday: 'long' })
      const date = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      return html
        .replace('<span class="top-build"></span>', '<span class="top-build">dev</span>')
        .replace(/<span class="sched-day">[^<]*<\/span>/, `<span class="sched-day">${weekday}</span>`)
        .replace(/<span class="sched-date">[^<]*<\/span>/, `<span class="sched-date">${date}</span>`)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        const path = url.split('?')[0]
        // the landing page: in production the Worker serves it (to stamp the build); in dev let Vite transform it
        if (path === '/' && req.method === 'GET') {
          const html = await server.transformIndexHtml(url, fs.readFileSync('index.html', 'utf8'))
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          return res.end(html)
        }
        // beardash.dev/<subdomain> shortcut (the Worker does this in production)
        const sub = path.match(/^\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\/?$/i)?.[1].toLowerCase()
        if (sub && req.method === 'GET' && !DEV_RESERVED.has(sub) && !fs.existsSync(`public/${sub}`) && !fs.existsSync(`public/${sub}.html`)) {
          res.statusCode = 302
          res.setHeader('Location', `/dashboard?add=${sub}`)
          return res.end()
        }
        if (path !== '/dashboard' && !path.startsWith('/dashboard/')) return next()
        // canonical URLs have no trailing slash
        if (path.endsWith('/')) {
          res.statusCode = 308
          res.setHeader('Location', path.replace(/\/+$/, '') + (url.includes('?') ? url.slice(url.indexOf('?')) : ''))
          return res.end()
        }
        // app routes only: no file extension (leave /dashboard/index.html etc. to Vite)
        if (/\.[a-z0-9]+$/i.test(path) || req.method !== 'GET') return next()
        try {
          const html = await server.transformIndexHtml(url, fs.readFileSync('dashboard/index.html', 'utf8'))
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(html)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

// Cloudflare Workers Builds sets the commit it's building. Baked in, it becomes the public build number,
// so anyone can match beardash.dev to the exact commit on GitHub. Local builds have none.
const BUILD_COMMIT = (process.env.WORKERS_CI_COMMIT_SHA ?? '').replace(/[^a-f0-9]/gi, '').slice(0, 40).toLowerCase()

export default defineConfig({
  define: { __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT) },
  plugins: [dashboardDevShell(), react(), cloudflare()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          // "/" is the static landing page; the app lives at /dashboard/; 404.html is the not-found page.
          input: { landing: 'index.html', dashboard: 'dashboard/index.html', notFound: '404.html' },
        },
      },
    },
  },
})
