import { useCallback, useEffect, useMemo, useState } from 'react'
import { bear, cached, postStatus, type Post, type PostStatus } from '../api'
import { Link, useRouter } from '../router'
import { Icon, Skel, skelWidth, Status, Empty, Menu, fmtDate, relTime, useToast, useConfirm, copy } from '../ui'

const TABS: { key: PostStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
]

export function PostList({ kind }: { kind: 'post' | 'page' }) {
  const { search, navigate } = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const status = (new URLSearchParams(search).get('status') as PostStatus | null) ?? 'all'
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [count, setCount] = useState(0)
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = useState('')
  const base = kind === 'page' ? '/pages' : '/posts'
  const noun = kind
  const params = useCallback(
    (page: number) => ({ page, is_page: kind === 'page', status: status === 'all' ? undefined : status }),
    [kind, status],
  )

  useEffect(() => {
    let live = true
    // Show the last-seen list instantly (if any), then refresh in the background.
    const hit = cached.posts(params(1))
    setPosts(hit?.posts ?? null)
    if (hit) {
      setCount(hit.count)
      setNextPage(hit.next_page)
    }
    bear
      .listPosts(params(1))
      .then((res) => {
        if (!live) return
        setCount(res.count)
        setNextPage(res.next_page)
        setPosts(res.posts)
      })
      .catch((e) => {
        if (!live) return
        toast(e.message, 'error')
        setPosts([])
      })
    return () => {
      live = false
    }
  }, [params, toast])

  const more = async (all = false) => {
    setLoadingMore(true)
    try {
      let p = nextPage
      while (p) {
        const res = await bear.listPosts(params(p))
        setPosts((prev) => [...(prev ?? []), ...res.posts])
        setNextPage(res.next_page)
        p = all ? res.next_page : null
      }
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = useMemo(() => {
    if (!posts) return null
    const needle = q.trim().toLowerCase()
    if (!needle) return posts
    return posts.filter(
      (p) => p.title?.toLowerCase().includes(needle) || p.slug?.toLowerCase().includes(needle) || p.tags?.some((t) => t.toLowerCase().includes(needle)),
    )
  }, [posts, q])

  const setPublish = async (p: Post, publish: boolean) => {
    if (!publish) {
      const ok = await confirm({
        title: `Unpublish “${p.title || 'Untitled'}”?`,
        body: 'It will be removed from your blog and moved back to drafts.',
        confirm: 'Unpublish',
      })
      if (!ok) return
    }
    try {
      const updated = await bear.updatePost(p.uid, { publish })
      setPosts((prev) =>
        (prev ?? [])
          .map((x) => (x.uid === p.uid ? { ...x, ...updated } : x))
          .filter((x) => status === 'all' || postStatus(x) === status),
      )
      toast(publish ? 'Published' : 'Moved to drafts')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const remove = async (p: Post) => {
    const ok = await confirm({
      title: `Delete “${p.title || 'Untitled'}”?`,
      body: `This permanently deletes the ${noun} from Bear. It can't be undone.`,
      confirm: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await bear.deletePost(p.uid)
      setPosts((prev) => prev?.filter((x) => x.uid !== p.uid) ?? null)
      setCount((c) => c - 1)
      toast('Deleted')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{kind === 'page' ? 'Pages' : 'Posts'}</h1>
          {kind === 'page' && <p className="page-sub">Standalone pages such as About or Now. They don't appear in your feed.</p>}
        </div>
        <Link to={`${base}/new`} className="btn btn-primary">
          <Icon name="plus" /> New {noun}
        </Link>
      </header>

      <div className="list-toolbar">
        <div className="tabs" role="tablist" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={status === t.key}
              className={status === t.key ? 'on' : ''}
              onClick={() => navigate(t.key === 'all' ? base : `${base}?status=${t.key}`, { replace: true })}
            >
              {t.label}
              {status === t.key && (posts ? <span className="tab-count">{count}</span> : <Skel w={16} h={9} className="tab-count-skel" />)}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, slug or tag" aria-label={`Filter ${noun}s`} />
          {q && (
            <button className="search-clear" onClick={() => setQ('')} aria-label="Clear filter">
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
      </div>

      {!filtered ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <Empty title={q ? `No ${noun}s match “${q}”` : status === 'all' ? `No ${noun}s yet` : `No ${status} ${noun}s`}>
          {q && nextPage ? (
            <button className="btn btn-sm" onClick={() => more(true)} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Search all ${count} ${noun}s`}
            </button>
          ) : (
            !q && (
              <Link to={`${base}/new`} className="btn btn-sm">
                New {noun}
              </Link>
            )
          )}
        </Empty>
      ) : (
        <div className="table" role="table" aria-label={`${noun}s`}>
          <div className="table-head" role="row">
            <span role="columnheader">Title</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Date</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {filtered.map((p) => {
            const st = postStatus(p)
            const viewUrl = p.url ? (st === 'draft' && p.token ? `${p.url}?token=${p.token}` : p.url) : null
            return (
              <div key={p.uid} className="table-row" role="row">
                <Link to={`${base}/${p.uid}`} className="cell-title" role="cell">
                  <span className="row-title">{p.title || 'Untitled'}</span>
                  <span className="row-sub">
                    {/* phones hide the Date column, so the date rides along here */}
                    <span className="row-date">{st === 'draft' ? `Edited ${relTime(p.last_modified)}` : fmtDate(p.published_date, st === 'scheduled', true)}</span>
                    /{p.slug}
                    {p.tags?.length ? <span className="row-tags">{p.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}</span> : null}
                  </span>
                </Link>
                <span role="cell">
                  <Status status={st} />
                </span>
                <span role="cell" className="cell-date" title={p.published_date ? new Date(p.published_date).toLocaleString() : undefined}>
                  {st === 'draft' ? `Edited ${relTime(p.last_modified)}` : fmtDate(p.published_date, st === 'scheduled', true)}
                </span>
                <span role="cell" className="cell-actions">
                  <Menu
                    items={[
                      { label: 'Edit', icon: 'posts', onSelect: () => navigate(`${base}/${p.uid}`) },
                      ...(viewUrl ? [{ label: st === 'draft' ? 'Preview on Bear' : 'View on blog', href: viewUrl, icon: 'external' as const }] : []),
                      ...(p.url && st !== 'draft' ? [{ label: 'Copy link', icon: 'link' as const, onSelect: () => copy(p.url!, toast, 'Link copied') }] : []),
                      st === 'draft'
                        ? { label: 'Publish now', icon: 'send' as const, onSelect: () => setPublish(p, true) }
                        : { label: 'Unpublish', icon: 'eye' as const, onSelect: () => setPublish(p, false) },
                      'separator' as const,
                      { label: 'Delete', icon: 'trash' as const, danger: true, onSelect: () => remove(p) },
                    ]}
                  />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {filtered && nextPage && !q && (
        <div className="load-more">
          <button className="btn" onClick={() => more(false)} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="table" aria-busy="true" aria-label="Loading">
      <div className="table-head">
        <span>Title</span>
        <span>Status</span>
        <span>Date</span>
        <span />
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="table-row">
          <div className="cell-title">
            <Skel w={skelWidth(i, 0.8)} h={13} />
            <Skel w={skelWidth(i + 3, 0.4)} h={10} />
          </div>
          <span className="status">
            <Skel w={7} h={7} r={4} />
            <Skel w={58} h={11} />
          </span>
          <span className="cell-date">
            <Skel w={64} h={11} />
          </span>
          <span />
        </div>
      ))}
    </div>
  )
}
