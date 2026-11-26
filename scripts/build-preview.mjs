// Packages the script-enabled preview page for its own Cloudflare deployment on a separate domain.
// Deploy it with `npm run deploy:preview`, then build the app with
// VITE_PREVIEW_URL=https://<that-domain>/preview-frame so the preview loads from there.
import fs from 'node:fs'

const out = 'dist-preview'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
fs.copyFileSync('public/preview-frame.html', `${out}/preview-frame.html`)

const csp =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; " +
  "img-src https: data: blob:; media-src https: data: blob:; font-src https: data:; connect-src https: wss:; " +
  "frame-src https:; form-action https:; base-uri 'none'; frame-ancestors https: http://localhost:*"
fs.writeFileSync(
  `${out}/_headers`,
  `/*\n  Content-Security-Policy: ${csp}\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n`,
)
console.log(`Preview page ready in ${out}/`)
