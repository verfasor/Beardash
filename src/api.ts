// Typed client. Bear calls go through Beardash's stateless pass-through Worker (/api/bear/<subdomain>/…)
// with this browser's API key attached. Keys, revisions and autosaves live in the browser (see vault.ts).
import { vault, cleanDraft, type BlogInfo } from './vault'
export type { BlogInfo }

export class ApiError extends Error {
  status: number
  retryAfter?: number
  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// Called when Bear rejects a stored key (revoked or regenerated), so the app can ask for a new one.
let onKeyRejected: ((subdomain: string) => void) | null = null
export function setKeyRejectedHandler(fn: (subdomain: string) => void) {
  onKeyRejected = fn
}

// The blog this tab is working on.
let currentBlog = ''
export function setCurrentBlog(subdomain: string) {
  currentBlog = subdomain
}
export const getCurrentBlog = () => currentBlog

// Last-seen Bear GET responses, so revisiting a page renders instantly while it refreshes.
// Any successful write clears it, so stale data is never shown after a change.
const cache = new Map<string, unknown>()
export const peek = <T>(path: string) => cache.get(`${currentBlog}|${path}`) as T | undefined

/** Low-level call to Bear through the pass-through Worker. `path` is relative, e.g. "post/?page=1". */
async function bearFetch<T>(subdomain: string, apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-Beardash', '1')
  headers.set('X-Bear-Key', apiKey)
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  let res: Response
  try {
    res = await fetch(`/api/bear/${encodeURIComponent(subdomain)}/${path}`, { ...init, headers, credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch {
    throw new ApiError('Network error. Check your connection.', 0)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const retry = Number(res.headers.get('retry-after')) || undefined
    let msg = data?.error || `Request failed (${res.status})`
    if (res.status === 429) msg = `Bear's rate limit hit. Try again in ${retry ?? 60}s.`
    if (res.status === 403) msg = data?.error && !/forbidden/i.test(data.error) ? data.error : 'The Bear API needs an upgraded blog.'
    if (res.status === 401) msg = 'Bear rejected the API key.'
    throw new ApiError(msg, res.status, retry)
  }
  return data as T
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const blog = currentBlog
  const key = await vault.resolveKey(blog)
  if (!key) throw new ApiError('Beardash is locked.', 401)
  const rel = path.replace(/^\/api\/bear\//, '')
  try {
    const data = await bearFetch<T>(blog, key, rel, init)
    if (method === 'GET') cache.set(`${blog}|${path}`, data)
    else cache.clear()
    // Keep the switcher's title/favicon in sync with Bear.
    if (rel.startsWith('blog/') && data && typeof data === 'object') {
      const b = data as { title?: string; favicon?: string }
      vault
        .updateBlogInfo(blog, {
          blogTitle: typeof b.title === 'string' ? b.title : undefined,
          favicon: typeof b.favicon === 'string' ? b.favicon : undefined,
        })
        .catch(() => {})
    }
    return data
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) onKeyRejected?.(blog)
    throw e
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

// ---------- types ----------
export type PostStatus = 'draft' | 'published' | 'scheduled'

export interface PostFields {
  title: string
  content: string
  slug: string
  publish: boolean
  published_date: string | null
  tags: string[]
  is_page: boolean
  discoverable: boolean
  alias: string
  canonical_url: string
  meta_description: string
  meta_image: string
  class_name: string
  lang: string
}

export interface Post extends Partial<PostFields> {
  uid: string
  url?: string
  last_modified?: string
  token?: string
  status?: PostStatus
}

export interface Paged {
  count: number
  page: number
  page_size: number
  next_page: number | null
}

export interface BlogSettings {
  title?: string
  content?: string
  favicon?: string
  meta_description?: string
  meta_image?: string
  nav?: string
  custom_styles?: string
  robots_txt?: string
  date_format?: string
  last_modified?: string
}

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'font'
export interface MediaItem {
  id: string | number
  url: string
  name: string
  type: MediaType | string
  tags?: string[]
  created_at?: string
}

export type SessionInfo = BlogInfo

export interface RevisionMeta {
  id: number
  title: string
  created_at: number
  size: number
  /** The version that was on Bear before an edit in Beardash. */
  fromBear?: boolean
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Bear's dashboard stores text with CRLF; editors normalise to LF. Compare/edit in LF only. */
export const lf = (s: string | null | undefined) => (s ?? '').replace(/\r\n?/g, '\n')

export function postStatus(p: Post): PostStatus {
  if (p.status) return p.status
  if (!p.publish) return 'draft'
  if (p.published_date && new Date(p.published_date).getTime() > Date.now()) return 'scheduled'
  return 'published'
}

// ---------- Beardash (all local to this browser) ----------
function normalizeSubdomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.bearblog\.dev.*$/, '')
    .replace(/\/.*$/, '')
}

export const session = {
  get: async () => ({ blogs: await vault.listBlogs() }),

  /** Checks the key with Bear, then saves it in this browser. */
  connect: async (rawSubdomain: string, rawKey: string) => {
    const subdomain = normalizeSubdomain(rawSubdomain)
    const apiKey = rawKey.trim()
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) throw new ApiError("That doesn't look like a Bear subdomain.", 400)
    if (!apiKey || apiKey.length > 512) throw new ApiError('Paste your API key.', 400)
    let blog: BlogSettings
    try {
      blog = await bearFetch<BlogSettings>(subdomain, apiKey, 'blog/')
    } catch (e) {
      const err = e as ApiError
      if (err.status === 404) throw new ApiError('No Bear Blog found at that subdomain.', 404)
      throw err
    }
    await vault.saveBlog({ subdomain, blogTitle: blog?.title ?? null, favicon: blog?.favicon ?? '' }, apiKey)
    cache.clear()
    return { subdomain, blogs: await vault.listBlogs() }
  },

  disconnect: async (subdomain: string) => {
    await vault.removeBlog(subdomain)
    cache.clear()
    return { blogs: await vault.listBlogs() }
  },

  logout: async () => {
    await vault.removeAllBlogs()
    cache.clear()
  },
}

const sec = (ms: number) => Math.floor(ms / 1000)

export const revisions = {
  list: async (key: string) => ({
    revisions: (await vault.listRevisions(currentBlog, key)).map(
      (r): RevisionMeta => ({ id: r.id!, title: r.title, created_at: sec(r.createdAt), size: r.content.length, fromBear: r.source === 'bear' }),
    ),
  }),
  get: async (_key: string, id: number) => {
    const r = await vault.getRevision(id)
    if (!r || r.subdomain !== currentBlog) throw new ApiError('Revision not found', 404)
    return { id: r.id!, title: r.title, content: r.content, created_at: sec(r.createdAt) }
  },
  add: (key: string, title: string, content: string) => vault.addRevision(currentBlog, key, title, content),
  /** Snapshot the version on Bear before saving over it (skipped if history already ends with it). */
  addFromBear: (key: string, title: string, content: string, modifiedAt?: string | null) =>
    vault.addRevision(currentBlog, key, title, content, { source: 'bear', createdAt: modifiedAt ? Date.parse(modifiedAt) || undefined : undefined }),
}

export const autosave = {
  get: async <T>(key: string) => {
    const a = await vault.getAutosave(currentBlog, key)
    const data = a ? cleanDraft(a.data) : null
    return { autosave: a && data ? { data: data as T, updatedAt: sec(Math.min(a.updatedAt, Date.now())) } : null }
  },
  put: (key: string, data: unknown) => vault.putAutosave(currentBlog, key, data),
  clear: (key: string) => vault.clearAutosave(currentBlog, key),
}

// ---------- Bear ----------
const postsPath = (params: { page?: number; status?: PostStatus; is_page?: boolean } = {}) => `/api/bear/post/${qs(params)}`
const mediaPath = (params: { page?: number; type?: MediaType } = {}) => `/api/bear/media/${qs(params)}`

export const cached = {
  posts: (params: Parameters<typeof postsPath>[0] = {}) => peek<Paged & { posts: Post[] }>(postsPath(params)),
  media: (params: Parameters<typeof mediaPath>[0] = {}) => peek<Paged & { media: MediaItem[] }>(mediaPath(params)),
  blog: () => peek<BlogSettings>('/api/bear/blog/'),
}

export const bear = {
  listPosts: (params: Parameters<typeof postsPath>[0] = {}) => request<Paged & { posts: Post[] }>(postsPath(params)),
  getPost: (uid: string) => request<Post>(`/api/bear/post/${encodeURIComponent(uid)}/`),
  createPost: (data: Partial<PostFields>) => request<Post>('/api/bear/post/', json('POST', data)),
  updatePost: (uid: string, data: Partial<PostFields>) =>
    request<Post>(`/api/bear/post/${encodeURIComponent(uid)}/`, json('PATCH', data)),
  deletePost: (uid: string) => request(`/api/bear/post/${encodeURIComponent(uid)}/`, { method: 'DELETE' }),

  getBlog: () => request<BlogSettings>('/api/bear/blog/'),
  updateBlog: (data: Partial<BlogSettings>) => request<BlogSettings>('/api/bear/blog/', json('PATCH', data)),

  listMedia: (params: Parameters<typeof mediaPath>[0] = {}) => request<Paged & { media: MediaItem[] }>(mediaPath(params)),
  uploadMedia: (file: File, raw = false) => {
    const fd = new FormData()
    fd.append('file', file)
    if (raw) fd.append('raw', 'true')
    return request<MediaItem>('/api/bear/media/', { method: 'POST', body: fd })
  },
  deleteMedia: (id: string | number) => request(`/api/bear/media/${encodeURIComponent(String(id))}/`, { method: 'DELETE' }),
}
