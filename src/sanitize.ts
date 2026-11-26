// One sanitizer for every piece of HTML that enters the page (the Markdown preview, and anything else
// that reaches innerHTML via the Trusted Types default policy). Post content is untrusted: it may have
// been pasted from elsewhere. It must not be able to run code, restyle the app, overlay fake UI, or
// read the API-key/passphrase fields.
import DOMPurify from 'dompurify'

const CONFIG = {
  ADD_TAGS: ['video', 'audio', 'source', 'iframe'],
  ADD_ATTR: ['controls', 'allowfullscreen', 'loading', 'target'],
  // <style> could read input values through CSS selectors and leak them via background images;
  // form controls could fake a key prompt or clobber the app's own form ids.
  FORBID_TAGS: ['style', 'link', 'meta', 'base', 'form', 'input', 'textarea', 'select', 'button', 'option', 'object', 'embed'],
  FORBID_ATTR: ['srcdoc', 'formaction', 'form'],
  // Prefix id/name values ("user-content-…") so content can't clobber the app's DOM ids.
  SANITIZE_NAMED_PROPS: true,
}

let hooked = false
function installHooks() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
    if (el.tagName === 'IFRAME') {
      // Never frame Beardash itself (a same-origin frame with scripts could reach the parent).
      let sameOrigin = true
      try {
        sameOrigin = new URL(el.getAttribute('src') ?? '', location.href).origin === location.origin
      } catch {
        /* unparsable: treat as unsafe */
      }
      if (sameOrigin) {
        el.remove()
        return
      }
      // Embeds keep working, but can't navigate the app, open forms, or be styled into an overlay.
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation')
      el.setAttribute('referrerpolicy', 'no-referrer')
      el.setAttribute('loading', 'lazy')
      el.removeAttribute('style')
    }
  })
}

export function sanitizeHtml(html: string): string {
  installHooks()
  return DOMPurify.sanitize(html, CONFIG) as string
}
