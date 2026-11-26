// Trusted Types: the CSP only lets HTML into the page through this policy, so anything assigned to
// innerHTML (e.g. the Markdown preview) passes through the same sanitizer as the preview itself.
import { sanitizeHtml } from './sanitize'

type TT = { createPolicy: (name: string, rules: { createHTML: (s: string) => string }) => unknown }
const tt = (globalThis as { trustedTypes?: TT }).trustedTypes

if (tt) {
  try {
    tt.createPolicy('default', { createHTML: sanitizeHtml })
  } catch {
    /* policy already exists (hot reload) */
  }
}
