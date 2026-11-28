# Beardash

A custom dashboard for [Bear Blog](https://bearblog.dev?ref=beardash). Use it at [beardash.dev](https://beardash.dev).

This is the code that runs beardash.dev, published so you can see exactly what Beardash does with your API keys.

Beardash is an opinionated take on a Bear Blog dashboard, hence not accepting pull requests. Feedback is welcome at [mighil@beardash.dev](mailto:mighil@beardash.dev), and you're free to fork it and make it your own within the [license](LICENSE).

## Privacy

- **No remote database.** Your API keys, revision history and unsaved drafts stay in your browser (IndexedDB).
- **Requests pass straight through.** Bear's API doesn't allow browser requests, so a small Cloudflare Worker forwards them to Bear. It has no storage, sets no cookies and logs nothing. For the theme preview, it also fetches public pages of your blog, without your API key.
- **Optional passphrase lock.** API keys can be encrypted in the browser with PBKDF2-SHA256 (600k iterations) and AES-256-GCM.
- **Strict page security.** No inline or third-party scripts, and all HTML is sanitised before it enters the page. Post scripts only run in a sandboxed preview frame that can't reach the app.

## Verify what's running

beardash.dev deploys straight from `main`. The short code in the top-right of the site (like `e453d8a`) is the commit it was built from, so click it to see that exact code here.

## Where to look

| What | File |
| --- | --- |
| The Worker that forwards requests to Bear | `worker/index.ts` |
| Browser storage, encryption and backups | `src/vault.ts` |
| Requests from the app | `src/api.ts` |
| HTML sanitiser and Trusted Types | `src/sanitize.ts`, `src/trusted-types.ts` |
| Security headers (CSP) | `public/_headers` |
| Sandboxed script preview | `public/preview-frame.html`, `src/components/PreviewFrame.tsx` |
| Sandboxed theme preview | `public/theme-frame.html`, `src/components/ThemePreview.tsx` |

## License

[Beardash License 1.0](LICENSE), adapted from the Bear Blog License 2.0. You can use, modify and share the code, but you can't offer it as a hosted or managed service.

## Credits

Made by [Mighil](https://mighil.com). Not affiliated with Bear Blog.

The logo is the [Bear Face Light](https://www.svgrepo.com/svg/327853/bear-face-light) icon from the Retro Pixel Icons collection by [Buninux](https://www.svgrepo.com/author/Buninux/), via SVG Repo.

The social image generator is based on [Robert Birming's meta image generator](https://robertbirming.com/bear-blog-meta-image-generator/), the original version he made for Bear Blog's own dashboard. Beardash's version is rewritten from scratch, with its style set in Settings instead of in code, and it adds a few features of its own.

The themes in the Bear themes gallery come from the official Bear Blog dashboard (last imported on Nov 28, 2026). Credit and ownership belong to the people who made them.

The landing page uses [Lusitana](https://fonts.google.com/specimen/Lusitana) by Ana Paula Megda, under the SIL Open Font License 1.1 (`public/fonts/Lusitana-OFL.txt`).
