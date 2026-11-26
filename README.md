# Beardash

A custom dashboard for [Bear Blog](https://bearblog.dev?ref=beardash). Use it at [beardash.dev](https://beardash.dev).

This code is here so you can see exactly what Beardash does with your API keys. It isn't set up for contributions, and pull requests aren't accepted.

## Privacy

- **No remote database.** Your API keys, revision history and unsaved drafts stay in your browser (IndexedDB).
- **Requests pass straight through.** Bear's API doesn't allow browser requests, so a small Cloudflare Worker forwards them to Bear. It has no storage, sets no cookies and logs nothing.
- **Optional passphrase lock.** API keys can be encrypted in the browser with PBKDF2-SHA256 (600k iterations) and AES-256-GCM.
- **Strict page security.** No inline or third-party scripts, and all HTML is sanitised before it enters the page. Post scripts only run in a sandboxed preview frame that can't reach the app.

## Where to look

| What | File |
| --- | --- |
| The Worker that forwards requests to Bear | `worker/index.ts` |
| Browser storage, encryption and backups | `src/vault.ts` |
| Requests from the app | `src/api.ts` |
| HTML sanitiser and Trusted Types | `src/sanitize.ts`, `src/trusted-types.ts` |
| Security headers (CSP) | `public/_headers` |
| Sandboxed script preview | `public/preview-frame.html`, `src/components/PreviewFrame.tsx` |

## Credits

Made by [Mighil](https://mighil.com). Not affiliated with Bear Blog.

The logo is the [Bear Face Light](https://www.svgrepo.com/svg/327853/bear-face-light) icon from the Retro Pixel Icons collection by [Buninux](https://www.svgrepo.com/author/Buninux/), via SVG Repo.

The landing page uses [Lusitana](https://fonts.google.com/specimen/Lusitana) by Ana Paula Megda, under the SIL Open Font License 1.1 (`public/fonts/Lusitana-OFL.txt`).
