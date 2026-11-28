import type { ReactNode } from 'react'
import { Icon, Kbd, MOD, type IconName } from '../ui'
import { ShortcutList } from '../shortcuts'

type Section = { id: string; title: string; icon: IconName; body: ReactNode }

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: 'home',
    body: (
      <>
        <p>Beardash is an editor and dashboard for your Bear Blog. It talks to Bear through Bear's official API, so everything you do here happens on your real blog.</p>
        <ol>
          <li>
            In Bear, open <b>Settings → API</b> and create a key. The API needs an upgraded Bear plan.
          </li>
          <li>In Beardash, enter your blog's subdomain and paste the key.</li>
          <li>
            Use the sidebar to move between <b>Overview</b>, <b>Posts</b>, <b>Pages</b>, <b>Media</b>, <b>Themes</b> and <b>Settings</b>.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: 'writing',
    title: 'Writing',
    icon: 'posts',
    body: (
      <>
        <p>
          Click <b>New post</b>. Give it a title, then write in Markdown. HTML and LaTeX work too, just like in Bear.
        </p>
        <ul>
          <li>
            <b>Toolbar:</b> headings, bold, italic, links, images, quotes, lists, code, tables and dividers. Select text first to format it.
          </li>
          <li>
            <b>Images:</b> paste or drop an image straight into the editor to upload it. Or use the image button to upload, pick from your
            media library, or insert by URL. Add alt text so screen readers can describe it.
          </li>
          <li>
            <b>Pasting:</b> copy from a web page, Google Docs, Notion, Word or an email and the formatting comes in as Markdown: headings,
            bold, italic, links, lists, quotes, code and tables. Styling like fonts and colours is dropped. To paste plain text instead, use{' '}
            <Kbd>{MOD}</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>V</Kbd>.
          </li>
          <li>
            <b>View modes:</b> switch between <b>Write</b>, <b>Split</b> and <b>Preview</b> at the top. In Split, the preview scrolls with
            you.
          </li>
          <li>
            <b>Focus mode</b> (<Kbd>{MOD}</Kbd>
            <Kbd>.</Kbd>) hides the toolbars so it's just you and the words.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'publishing',
    title: 'Saving & publishing',
    icon: 'send',
    body: (
      <>
        <ul>
          <li>
            <b>Save draft</b> saves to Bear without publishing. <Kbd>{MOD}</Kbd>
            <Kbd>S</Kbd> works anywhere in the editor.
          </li>
          <li>
            <b>Publish…</b> asks whether to publish now or <b>schedule</b> it for a date and time. Scheduling is Bear's own feature: Bear
            publishes the post even when Beardash is closed.
          </li>
          <li>
            Once a post is live, the button becomes <b>Update post</b>. To take a post down, use the <b>⋯</b> menu and choose{' '}
            <b>Unpublish</b>, which moves it back to drafts.
          </li>
          <li>
            The <b>settings panel</b> (the sidebar icon at the top right of the editor) holds the slug, tags, publish date,
            discoverability, SEO fields, alias, CSS class and language.
          </li>
          <li>
            <b>Social images and favicons:</b> Bear only takes a link for these. In Beardash you can paste a URL, click <b>Upload</b> to
            send a file straight to Bear, or pick one from your <b>Library</b>. This works for a post's social image in the settings panel,
            and for your blog's <b>favicon</b> and <b>social image</b> under Settings. Uploads keep their original size and format, so
            every site can show them.
          </li>
          <li>
            No social image yet? You can generate one from the title. See <b>Social images</b> below.
          </li>
          <li>
            <b>Pages</b> work the same way as posts, but don't appear in your post list or feed. They're good for About or Now pages.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'history',
    title: 'Autosave & history',
    icon: 'history',
    body: (
      <ul>
        <li>
          <b>Autosave:</b> while you type, Beardash keeps a backup of unsaved changes. If a tab closes before you save, you'll be offered{' '}
          <b>Restore</b> next time you open that post.
        </li>
        <li>
          <b>History:</b> every save is snapshotted, keeping the last 50 per post. Open the clock icon in the editor to read an older version
          and restore it. Restoring puts the text back in the editor; it only reaches Bear when you save. Bear doesn't keep old versions, so
          the first time you save a post, Beardash also keeps the version that was on Bear, marked <b>From Bear</b>. The same happens if
          the post was changed on Bear's site since your last save here.
        </li>
        <li>
          Your blog's CSS has history too. See <b>Themes</b> below.
        </li>
        <li>Autosaves and history live in this browser only. Use a backup (see below) to move them to another device.</li>
      </ul>
    ),
  },
  {
    id: 'social',
    title: 'Social images',
    icon: 'image',
    body: (
      <>
        <p>
          Beardash can make a social image for any post or page: a 1200×630 card with the title, your name and avatar, and optionally the
          description. <span className="beta-pill">Beta</span>
        </p>
        <ol>
          <li>
            Set your style once in <b>Settings → Social image</b>: name, subline, avatar (a URL, an upload or one from your Library, as a
            circle or rounded square), colours, font, whether to show the description, and the file format. The preview updates as you go.
          </li>
          <li>
            In a post or page, open the settings panel and click <b>Generate from title</b> under the social image field.
          </li>
          <li>Check the preview. You can reword the title or description for the image without changing the post.</li>
          <li>
            Click <b>Upload and use</b>. The image goes to your Bear media and fills in the social image field. Or click <b>Download</b> to
            keep a copy.
          </li>
          <li>Save the post to apply it.</li>
        </ol>
        <ul>
          <li>
            <b>Format:</b> PNG has the sharpest text and the largest file. JPEG is much smaller and every social site shows it. WebP is the
            smallest, but a few social sites don't show it. Settings shows the size for each.
          </li>
          <li>Your style is saved in this browser only, separately for each blog.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'theme',
    title: 'Themes',
    icon: 'eye',
    body: (
      <>
        <p>
          <b>Themes</b> in the sidebar holds your blog's CSS. Above the editor are three tools: <b>Bear themes</b>, <b>History</b> and{' '}
          <b>Preview</b>.
        </p>
        <ul>
          <li>
            <b>Preview</b> shows your CSS on your real blog, next to the editor, and updates as you type, before you save. Click links in it
            to move around your blog, use <b>Home</b> and <b>Blog</b> to jump back, or switch to <b>Phone</b> width. Your blog's own scripts
            don't run in the preview.
          </li>
          <li>
            <b>Bear themes</b> lists Bear Blog's built-in themes, each shown on your own blog. Click through them to compare, then click{' '}
            <b>Use</b> to put that theme's CSS in the editor. Like Bear's own theme picker, this replaces your CSS, but nothing changes on
            your blog until you save. Then tweak it with Preview open.
          </li>
          <li>
            <b>History</b> keeps each version you save, plus the one that was on Bear before your first edit (marked <b>From Bear</b>), and
            what was in the editor whenever you switch themes. Pick one to read it, then <b>Restore this version</b> and save. The last 50
            are kept in this browser.
          </li>
        </ul>
        <p>Not happy with a change you haven't saved yet? Click <b>Discard</b> in the bar at the bottom.</p>
      </>
    ),
  },
  {
    id: 'scripts',
    title: 'Previewing scripts',
    icon: 'code',
    body: (
      <>
        <p>
          Bear runs <code>&lt;script&gt;</code> tags for upgraded blogs. To see them in Beardash, turn on <b>Run scripts</b> in the preview
          pane. It's off by default.
        </p>
        <p>
          Scripts run in an isolated sandbox: they can't see Beardash, your keys or your other posts, can't redirect the page, and can't show
          pop-ups. The preview reloads about half a second after you stop typing.
        </p>
      </>
    ),
  },
  {
    id: 'blogs',
    title: 'Multiple blogs',
    icon: 'pages',
    body: (
      <ul>
        <li>
          Click your blog's name at the <b>top left</b> to switch blogs, or choose <b>Add a blog</b> to connect another one with its own API
          key.
        </li>
        <li>
          <b>Shortcut:</b> go to <code>{location.host}/yourblog</code>, using your blog's subdomain. If you're new, the subdomain is filled
          in for you. If you're signed in, Beardash offers to add that blog, or switches to it if it's already connected.
        </li>
        <li>Each browser tab remembers its own blog, so you can work on two blogs side by side.</li>
        <li>
          Hover a blog in that menu and click <b>×</b> to disconnect it. Beardash only forgets the key; nothing on Bear changes.
        </li>
      </ul>
    ),
  },
  {
    id: 'privacy',
    title: 'Your data & privacy',
    icon: 'shield',
    body: (
      <>
        <p>
          <b>Beardash has no database.</b> Your API keys, history and unsaved drafts stay in this browser. Requests to Bear pass through a
          small Cloudflare Worker that stores and logs nothing. The theme preview loads public pages of your blog the same way,
          without your API key.
        </p>
        <p>
          Open <b>Keys &amp; data</b> (the shield icon at the bottom of the sidebar) to:
        </p>
        <ul>
          <li>
            <b>Set a passphrase</b> that encrypts your keys. You'll enter it when you open Beardash in a new tab or after a refresh.{' '}
            <b>It can't be recovered if you forget it.</b>
          </li>
          <li>
            <b>Export</b> an encrypted backup file, and <b>Import</b> it in another browser or device. This is how you move Beardash between
            computers.
          </li>
          <li>
            <b>Erase</b> everything Beardash stored in this browser.
          </li>
        </ul>
        <p className="guide-note">Clearing your browser's site data also removes your keys and history. Keep a backup if that matters to you.</p>
      </>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    icon: 'keyboard',
    body: (
      <>
        <p>
          Press <Kbd>?</Kbd> anywhere outside a text field to see these at any time.
        </p>
        <ShortcutList />
      </>
    ),
  },
  {
    id: 'trouble',
    title: 'Limits & troubleshooting',
    icon: 'alert',
    body: (
      <dl className="faq">
        <dt>“Bear's rate limit hit”</dt>
        <dd>Bear allows 60 requests a minute per key and 100 uploads a day. Wait the time shown and carry on. Nothing is lost.</dd>
        <dt>“Reconnect your blog”</dt>
        <dd>Bear rejected the saved key, usually because it was regenerated or revoked in Bear. Paste the new key from Bear → Settings → API.</dd>
        <dt>Forgot the passphrase</dt>
        <dd>
          On the lock screen, choose <b>Reset Beardash in this browser</b>, then reconnect with your API keys or restore a backup. Your blogs
          on Bear aren't affected.
        </dd>
        <dt>Uploads failing</dt>
        <dd>Files must be under 10 MB. Images are resized to 1200px and converted to WebP unless you tick “Keep originals” on the Media page.</dd>
        <dt>Preview looks different from my blog</dt>
        <dd>The preview approximates Bear's default look. Your blog's theme and custom CSS apply only on the live site.</dd>
      </dl>
    ),
  },
  {
    id: 'credits',
    title: 'Credits',
    icon: 'info',
    body: (
      <>
      <p>
        Beardash is made by{' '}
        <a href="https://mighil.com" target="_blank" rel="noopener noreferrer">
          Mighil
        </a>
        {' '}and runs on Cloudflare. If you use it a lot, a little support on{' '}
        <a href="https://ko-fi.com/mighil" target="_blank" rel="noopener noreferrer">
          Ko-fi
        </a>{' '}
        helps keep it hosted for the long run.
      </p>
      <p>
        The Beardash logo is the{' '}
        <a href="https://www.svgrepo.com/svg/327853/bear-face-light" target="_blank" rel="noopener noreferrer">
          Bear Face Light
        </a>{' '}
        icon from the Retro Pixel Icons collection by{' '}
        <a href="https://www.svgrepo.com/author/Buninux/" target="_blank" rel="noopener noreferrer">
          Buninux
        </a>
        , via SVG Repo.
      </p>
      <p>
        The social image generator is based on{' '}
        <a href="https://robertbirming.com/bear-blog-meta-image-generator/" target="_blank" rel="noopener noreferrer">
          Robert Birming's meta image generator
        </a>
        , the original version he made for Bear Blog's own dashboard. Beardash's version is rewritten from scratch, with its style set in
        Settings instead of in code, and it adds a few features of its own.
      </p>
      <p>
        The themes in the Bear themes gallery come from the official Bear Blog dashboard (last imported on Nov 28, 2026). Credit and ownership belong to the people who made them.
      </p>
      </>
    ),
  },
]

export function Docs() {
  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Docs</h1>
          <p className="page-sub">How to use Beardash: writing, publishing, history, social images, themes, privacy and shortcuts.</p>
        </div>
      </header>
      <div className="guide">
      <nav className="guide-toc" aria-label="On this page">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => jump(s.id)}>
            <Icon name={s.icon} size={14} />
            {s.title}
          </button>
        ))}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={`guide-${s.id}`} className="guide-section">
          <h3>{s.title}</h3>
          <div className="guide-card">{s.body}</div>
        </section>
      ))}
      </div>
    </div>
  )
}
