// Everything Beardash keeps lives here, in this browser's IndexedDB. Nothing is stored on a server.
//
//  blogs      connected Bear Blogs + their API keys (plain, or AES-GCM encrypted when a passphrase is set)
//  revisions  snapshot of title/content on every save (last 50 per post)
//  autosaves  unsaved editor state
//  meta       passphrase lock parameters

export interface BlogInfo {
  subdomain: string
  blogTitle: string | null
  /** From Bear settings: an emoji or image URL. null = not fetched yet, '' = none. */
  favicon?: string | null
}

type Sealed = { ct: string; iv: string }
type StoredBlog = BlogInfo & { addedAt: number; key: { plain: string } | Sealed }
/** source 'bear': the version that was on Bear before an edit in Beardash (Bear itself keeps no history). */
type Revision = { id?: number; subdomain: string; key: string; title: string; content: string; createdAt: number; source?: 'bear' }
type Autosave = { id: string; data: unknown; updatedAt: number }
type LockMeta = { k: 'lock'; salt: string; iterations: number; verifier: Sealed }

const DB_NAME = 'beardash'
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const KEY_RE = /^[A-Za-z0-9_-]{1,120}$/
const MAX_REVISIONS = 50
const PBKDF2_ITERATIONS = 600_000
const VERIFIER = 'beardash-unlocked'
const LEGACY_VERIFIERS = ['mishka-unlocked'] // the project was called Mishka before; keep old vaults unlockable

// ---------- tiny IndexedDB helpers ----------
const LEGACY_DB = 'mishka' // the project's previous name
const STORES = ['blogs', 'revisions', 'autosaves', 'meta'] as const

let dbp: Promise<IDBDatabase> | null = null
function db() {
  dbp ??= openDb().then(async (d) => {
    await migrateLegacy(d).catch(() => {})
    return d
  })
  return dbp
}

/** One-time copy from the database used under the old project name, then delete it. */
async function migrateLegacy(target: IDBDatabase) {
  const list = (await indexedDB.databases?.()) ?? []
  if (!list.some((x) => x.name === LEGACY_DB)) return
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = () => req.transaction?.abort() // doesn't really exist; don't create it
  })
  const names = STORES.filter((n) => old.objectStoreNames.contains(n))
  const data: Record<string, unknown[]> = {}
  await new Promise<void>((resolve, reject) => {
    const t = old.transaction(names, 'readonly')
    for (const n of names) t.objectStore(n).getAll().onsuccess = (e) => (data[n] = (e.target as IDBRequest).result)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
  old.close()
  const hasData = await new Promise<boolean>((resolve) => {
    const r = target.transaction('blogs', 'readonly').objectStore('blogs').count()
    r.onsuccess = () => resolve(r.result > 0)
    r.onerror = () => resolve(true)
  })
  if (!hasData) {
    await new Promise<void>((resolve, reject) => {
      const t = target.transaction([...STORES], 'readwrite')
      for (const n of names) for (const row of data[n] ?? []) t.objectStore(n).put(row)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  }
  await new Promise<void>((resolve) => {
    const del = indexedDB.deleteDatabase(LEGACY_DB)
    del.onsuccess = del.onerror = del.onblocked = () => resolve()
  })
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      d.createObjectStore('blogs', { keyPath: 'subdomain' })
      d.createObjectStore('revisions', { keyPath: 'id', autoIncrement: true }).createIndex('post', ['subdomain', 'key'])
      d.createObjectStore('autosaves', { keyPath: 'id' })
      d.createObjectStore('meta', { keyPath: 'k' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('Close other Beardash tabs and reload.'))
  })
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function tx<T>(stores: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const t = (await db()).transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'))
  })
  const result = await fn(t)
  await done
  return result
}

// ---------- crypto ----------
const te = new TextEncoder()
const td = new TextDecoder()
export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function seal(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text))
  return { ct: b64(ct), iv: b64(iv) }
}
export async function open(key: CryptoKey, s: Sealed) {
  return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, key, unb64(s.ct)))
}

/** Keep only the editor fields an autosave may contain, with the right types. */
export function cleanDraft(d: any) {
  if (!d || typeof d !== 'object' || typeof d.title !== 'string' || typeof d.content !== 'string') return null
  const s = (k: string, max = 10_000) => (typeof d[k] === 'string' ? d[k].slice(0, max) : '')
  return {
    title: d.title.slice(0, 300),
    content: d.content.slice(0, 1_000_000),
    slug: s('slug', 200),
    publish: d.publish === true,
    published_date: s('published_date', 40),
    tags: Array.isArray(d.tags) ? d.tags.filter((t: unknown) => typeof t === 'string').slice(0, 100).map((t: string) => t.slice(0, 100)) : [],
    is_page: d.is_page === true,
    discoverable: d.discoverable === true,
    alias: s('alias', 300),
    canonical_url: s('canonical_url', 2000),
    meta_description: s('meta_description', 1000),
    meta_image: s('meta_image', 2000),
    class_name: s('class_name', 200),
    lang: s('lang', 20),
  }
}

// ---------- in-memory unlocked state (never persisted) ----------
let lockKey: CryptoKey | null = null
const keys = new Map<string, string>()

async function getLockMeta() {
  return tx('meta', 'readonly', (t) => wrap(t.objectStore('meta').get('lock')) as Promise<LockMeta | undefined>)
}

async function allBlogs() {
  return tx('blogs', 'readonly', (t) => wrap(t.objectStore('blogs').getAll()) as Promise<StoredBlog[]>)
}

const toInfo = ({ subdomain, blogTitle, favicon }: StoredBlog): BlogInfo => ({ subdomain, blogTitle, favicon })

export const vault = {
  /** Loads plain keys into memory. Returns whether a passphrase is needed. */
  async init() {
    const lock = await getLockMeta()
    if (!lock) {
      for (const b of await allBlogs()) if ('plain' in b.key) keys.set(b.subdomain, b.key.plain)
    }
    return { lockEnabled: !!lock, locked: !!lock && !lockKey }
  },

  async lockEnabled() {
    return !!(await getLockMeta())
  },

  /** Returns false for a wrong passphrase. Only marks the tab unlocked once every key decrypted. */
  async unlock(passphrase: string) {
    const lock = await getLockMeta()
    if (!lock) return true
    const key = await deriveKey(passphrase, unb64(lock.salt), lock.iterations)
    try {
      const v = await open(key, lock.verifier)
      if (v !== VERIFIER && !LEGACY_VERIFIERS.includes(v)) return false
    } catch {
      return false
    }
    const decrypted = new Map<string, string>()
    for (const b of await allBlogs()) {
      if ('ct' in b.key) decrypted.set(b.subdomain, await open(key, b.key)) // throws on a corrupted row
      else decrypted.set(b.subdomain, b.key.plain)
    }
    keys.clear()
    for (const [k, v] of decrypted) keys.set(k, v)
    lockKey = key
    return true
  },

  /** Forgets the decrypted keys in this tab. */
  lock() {
    lockKey = null
    keys.clear()
  },

  /**
   * Read every stored key from IndexedDB (not this tab's memory, which may miss blogs added in
   * another tab). Throws rather than ever re-saving a key as empty.
   */
  async _readAllKeys() {
    const lock = await getLockMeta()
    if (lock && !lockKey) throw new Error('Unlock Beardash first.')
    const out: { row: StoredBlog; apiKey: string }[] = []
    for (const row of await allBlogs()) {
      let apiKey: string
      try {
        apiKey = 'plain' in row.key ? row.key.plain : await open(lockKey!, row.key)
      } catch {
        throw new Error(`Couldn't read the key for ${row.subdomain}. Reload this tab and try again.`)
      }
      if (!apiKey) throw new Error(`The key for ${row.subdomain} is missing. Reconnect it first.`)
      out.push({ row, apiKey })
    }
    return out
  },

  /** Encrypt every stored key with a new passphrase (also used to change it). Must be unlocked. */
  async setPassphrase(passphrase: string) {
    const current = await this._readAllKeys()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
    const sealed = await Promise.all(current.map(async ({ row, apiKey }) => ({ ...row, key: await seal(key, apiKey) })))
    const meta: LockMeta = { k: 'lock', salt: b64(salt), iterations: PBKDF2_ITERATIONS, verifier: await seal(key, VERIFIER) }
    await tx(['blogs', 'meta'], 'readwrite', (t) => {
      for (const b of sealed) t.objectStore('blogs').put(b)
      t.objectStore('meta').put(meta)
    })
    lockKey = key
    for (const { row, apiKey } of current) keys.set(row.subdomain, apiKey)
  },

  /** Store keys unencrypted again. Must be unlocked. */
  async removePassphrase() {
    const current = await this._readAllKeys()
    await tx(['blogs', 'meta'], 'readwrite', (t) => {
      for (const { row, apiKey } of current) t.objectStore('blogs').put({ ...row, key: { plain: apiKey } })
      t.objectStore('meta').delete('lock')
    })
    lockKey = null
    for (const { row, apiKey } of current) keys.set(row.subdomain, apiKey)
  },

  /** A blog's key, loading it from storage if another tab added it after this one started. */
  async resolveKey(subdomain: string) {
    const known = keys.get(subdomain)
    if (known) return known
    const row = await tx('blogs', 'readonly', (t) => wrap(t.objectStore('blogs').get(subdomain)) as Promise<StoredBlog | undefined>)
    if (!row) return null
    try {
      const k = 'plain' in row.key ? row.key.plain : lockKey ? await open(lockKey, row.key) : null
      if (k) keys.set(subdomain, k)
      return k
    } catch {
      return null
    }
  },

  async listBlogs(): Promise<BlogInfo[]> {
    return (await allBlogs()).sort((a, b) => a.addedAt - b.addedAt).map(toInfo)
  },

  getKey(subdomain: string) {
    return keys.get(subdomain) ?? null
  },

  async saveBlog(info: BlogInfo, apiKey: string) {
    const existing = await tx('blogs', 'readonly', (t) => wrap(t.objectStore('blogs').get(info.subdomain)) as Promise<StoredBlog | undefined>)
    const lock = await getLockMeta()
    if (lock && !lockKey) throw new Error('Unlock Beardash first.')
    const key = lock && lockKey ? await seal(lockKey, apiKey) : { plain: apiKey }
    const row: StoredBlog = { ...info, addedAt: existing?.addedAt ?? Date.now(), key }
    await tx('blogs', 'readwrite', (t) => wrap(t.objectStore('blogs').put(row)))
    keys.set(info.subdomain, apiKey)
  },

  async updateBlogInfo(subdomain: string, patch: Partial<Omit<BlogInfo, 'subdomain'>>) {
    await tx('blogs', 'readwrite', async (t) => {
      const s = t.objectStore('blogs')
      const row = (await wrap(s.get(subdomain))) as StoredBlog | undefined
      if (row) s.put({ ...row, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) })
    })
  },

  async removeBlog(subdomain: string) {
    await tx('blogs', 'readwrite', (t) => wrap(t.objectStore('blogs').delete(subdomain)))
    keys.delete(subdomain)
  },

  /** Sign out: forget every key. Revision history and autosaves stay unless eraseEverything is used. */
  async removeAllBlogs() {
    await tx(['blogs', 'meta'], 'readwrite', (t) => {
      t.objectStore('blogs').clear()
      t.objectStore('meta').delete('lock')
    })
    this.lock()
  },

  async eraseEverything() {
    await tx(['blogs', 'revisions', 'autosaves', 'meta'], 'readwrite', (t) => {
      for (const s of ['blogs', 'revisions', 'autosaves', 'meta']) t.objectStore(s).clear()
    })
    this.lock()
  },

  // ----- revisions -----
  async listRevisions(subdomain: string, key: string) {
    const rows = await tx('revisions', 'readonly', (t) => wrap(t.objectStore('revisions').index('post').getAll([subdomain, key])) as Promise<Revision[]>)
    return rows.sort((a, b) => b.createdAt - a.createdAt || b.id! - a.id!).slice(0, MAX_REVISIONS)
  },

  async getRevision(id: number) {
    return tx('revisions', 'readonly', (t) => wrap(t.objectStore('revisions').get(id)) as Promise<Revision | undefined>)
  },

  async addRevision(subdomain: string, key: string, title: string, content: string, opts: { createdAt?: number; source?: 'bear' } = {}) {
    const existing = await this.listRevisions(subdomain, key)
    // Same as the latest snapshot? Ignore line endings and trailing whitespace (Bear may tidy those).
    const norm = (t: string) => t.replace(/\r\n?/g, '\n').trimEnd()
    if (existing[0] && norm(existing[0].title) === norm(title) && norm(existing[0].content) === norm(content)) return false
    // Keep history in order even if Bear's clock says the original is newer than our last snapshot.
    const createdAt = Math.min(opts.createdAt ?? Date.now(), Date.now())
    const at = existing[0] && createdAt <= existing[0].createdAt ? existing[0].createdAt + 1 : createdAt
    await tx('revisions', 'readwrite', (t) => {
      const s = t.objectStore('revisions')
      s.add({ subdomain, key, title, content, createdAt: at, ...(opts.source ? { source: opts.source } : {}) })
      for (const old of existing.slice(MAX_REVISIONS - 1)) s.delete(old.id!)
    })
    return true
  },

  // ----- autosaves -----
  async getAutosave(subdomain: string, key: string) {
    return tx('autosaves', 'readonly', (t) => wrap(t.objectStore('autosaves').get(`${subdomain}|${key}`)) as Promise<Autosave | undefined>)
  },
  async putAutosave(subdomain: string, key: string, data: unknown) {
    await tx('autosaves', 'readwrite', (t) => wrap(t.objectStore('autosaves').put({ id: `${subdomain}|${key}`, data, updatedAt: Date.now() })))
  },
  async clearAutosave(subdomain: string, key: string) {
    await tx('autosaves', 'readwrite', (t) => wrap(t.objectStore('autosaves').delete(`${subdomain}|${key}`)))
  },

  // ----- backup -----
  /** An encrypted backup file. Keys are never exported in the clear. */
  async exportBackup(password: string, includeHistory: boolean) {
    const blogs = await allBlogs()
    const payload = {
      blogs: blogs.map((b) => ({ subdomain: b.subdomain, blogTitle: b.blogTitle, favicon: b.favicon ?? null, addedAt: b.addedAt, apiKey: keys.get(b.subdomain) ?? '' })),
      revisions: includeHistory ? await tx('revisions', 'readonly', (t) => wrap(t.objectStore('revisions').getAll()) as Promise<Revision[]>) : [],
      autosaves: includeHistory ? await tx('autosaves', 'readonly', (t) => wrap(t.objectStore('autosaves').getAll()) as Promise<Autosave[]>) : [],
    }
    if (payload.blogs.some((b) => !b.apiKey)) throw new Error('Unlock Beardash before exporting.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
    const sealed = await seal(key, JSON.stringify(payload))
    const file = {
      format: 'beardash-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      blogs: blogs.map((b) => b.subdomain), // readable summary only; no keys
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: b64(salt) },
      cipher: { name: 'AES-GCM', iv: sealed.iv },
      data: sealed.ct,
    }
    return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  },

  /**
   * Merges a backup into this browser. A backup file is untrusted input: every field is type-checked,
   * existing keys are only replaced when asked, and imported drafts never overwrite local ones.
   */
  async importBackup(text: string, password: string, opts: { replaceExisting?: boolean } = {}) {
    if (text.length > 50_000_000) throw new Error('That file is too large to be a Beardash backup.')
    let file: any
    try {
      file = JSON.parse(text)
    } catch {
      throw new Error("That isn't a Beardash backup file.")
    }
    if (
      !['beardash-backup', 'mishka-backup'].includes(file?.format) ||
      file.version !== 1 ||
      typeof file.kdf?.salt !== 'string' ||
      typeof file.cipher?.iv !== 'string' ||
      typeof file.data !== 'string'
    ) {
      throw new Error("That isn't a Beardash backup file.")
    }
    const iterations = Math.min(Math.max(Number(file.kdf.iterations) || 0, 100_000), 5_000_000)
    let payload: any
    try {
      const key = await deriveKey(password, unb64(file.kdf.salt), iterations)
      payload = JSON.parse(await open(key, { ct: file.data, iv: file.cipher.iv }))
    } catch {
      throw new Error('Wrong password, or the file is damaged.')
    }
    const lock = await getLockMeta()
    if (lock && !lockKey) throw new Error('Unlock Beardash first.')

    const now = Date.now()
    const str = (v: unknown, max = 10_000) => (typeof v === 'string' ? v.slice(0, max) : null)
    const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, now) : now)
    const existing = new Set((await allBlogs()).map((b) => b.subdomain))

    const blogs: { row: StoredBlog; apiKey: string }[] = []
    let skipped = 0
    for (const b of Array.isArray(payload?.blogs) ? payload.blogs : []) {
      const subdomain = str(b?.subdomain, 63)
      const apiKey = str(b?.apiKey, 512)
      if (!subdomain || !SUBDOMAIN_RE.test(subdomain) || !apiKey) continue
      if (existing.has(subdomain) && !opts.replaceExisting) {
        skipped++
        continue
      }
      blogs.push({
        apiKey,
        row: {
          subdomain,
          blogTitle: str(b.blogTitle, 300),
          favicon: str(b.favicon, 4096),
          addedAt: time(b.addedAt),
          key: lockKey ? await seal(lockKey, apiKey) : { plain: apiKey },
        },
      })
    }
    const known = new Set([...existing, ...blogs.map((b) => b.row.subdomain)])

    const allRevs = await tx('revisions', 'readonly', (t) => wrap(t.objectStore('revisions').getAll()) as Promise<Revision[]>)
    const have = new Set(allRevs.map((r) => `${r.subdomain}|${r.key}|${r.createdAt}`))
    const revs: Revision[] = []
    for (const r of Array.isArray(payload?.revisions) ? payload.revisions : []) {
      const subdomain = str(r?.subdomain, 63)
      const key = str(r?.key, 120)
      const content = str(r?.content, 1_000_000)
      if (!subdomain || !known.has(subdomain) || !key || !KEY_RE.test(key) || content === null) continue
      const rev: Revision = { subdomain, key, title: str(r.title, 300) ?? '', content, createdAt: time(r.createdAt), ...(r.source === 'bear' ? { source: 'bear' as const } : {}) }
      if (!have.has(`${rev.subdomain}|${rev.key}|${rev.createdAt}`)) revs.push(rev)
    }

    // Drafts: only well-formed ones for known blogs, never replacing a draft already in this browser.
    const localDrafts = new Set((await tx('autosaves', 'readonly', (t) => wrap(t.objectStore('autosaves').getAllKeys()) as Promise<IDBValidKey[]>)).map(String))
    const drafts: Autosave[] = []
    for (const a of Array.isArray(payload?.autosaves) ? payload.autosaves : []) {
      const id = str(a?.id, 200)
      const [sub, key] = (id ?? '').split('|')
      if (!id || !known.has(sub) || !key || !KEY_RE.test(key) || localDrafts.has(id)) continue
      const data = cleanDraft(a.data)
      if (data) drafts.push({ id, data, updatedAt: time(a.updatedAt) })
    }

    await tx(['blogs', 'revisions', 'autosaves'], 'readwrite', (t) => {
      for (const b of blogs) t.objectStore('blogs').put(b.row)
      for (const r of revs) t.objectStore('revisions').add(r)
      for (const d of drafts) t.objectStore('autosaves').put(d)
    })
    for (const b of blogs) keys.set(b.row.subdomain, b.apiKey)
    return { blogs: blogs.length, skipped, revisions: revs.length }
  },
}
