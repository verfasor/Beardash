import { useEffect, useState } from 'react'
import { bear, cached, type Post } from '../api'
import { Link } from '../router'
import { useSession, blogUrl } from '../App'
import { Icon, Skel, SkeletonRows, fmtDate, relTime, useToast } from '../ui'

const Q = {
  pub: { is_page: false, status: 'published' as const },
  draft: { is_page: false, status: 'draft' as const },
  sch: { is_page: false, status: 'scheduled' as const },
  pages: { is_page: true },
}

type Stats = { published: number; draft: number; scheduled: number; pages: number; media: number }

export function Home() {
  const { session } = useSession()
  const toast = useToast()
  // Seed from the last visit so the page renders instantly; the effect refreshes it.
  const [seed] = useState(() => {
    const pub = cached.posts(Q.pub), dr = cached.posts(Q.draft), sch = cached.posts(Q.sch), pages = cached.posts(Q.pages), media = cached.media()
    return pub && dr && sch && pages && media ? { pub, dr, sch, pages, media } : null
  })
  const [stats, setStats] = useState<Stats | null>(
    seed && { published: seed.pub.count, draft: seed.dr.count, scheduled: seed.sch.count, pages: seed.pages.count, media: seed.media.count },
  )
  const [published, setPublished] = useState<Post[] | null>(seed?.pub.posts.slice(0, 6) ?? null)
  const [drafts, setDrafts] = useState<Post[] | null>(seed?.dr.posts.slice(0, 6) ?? null)
  const [scheduled, setScheduled] = useState<Post[]>(seed?.sch.posts.slice(0, 3) ?? [])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [pub, dr, sch, pages, media] = await Promise.all([
          bear.listPosts(Q.pub),
          bear.listPosts(Q.draft),
          bear.listPosts(Q.sch),
          bear.listPosts(Q.pages),
          bear.listMedia(),
        ])
        if (!live) return
        setStats({ published: pub.count, draft: dr.count, scheduled: sch.count, pages: pages.count, media: media.count })
        setPublished(pub.posts.slice(0, 6))
        setDrafts(dr.posts.slice(0, 6))
        setScheduled(sch.posts.slice(0, 3))
      } catch (e) {
        if (!live) return
        toast((e as Error).message, 'error')
        setPublished([])
        setDrafts([])
      }
    })()
    return () => {
      live = false
    }
  }, [toast])

  const statItems: { label: string; value?: number; to: string }[] = [
    { label: 'Published', value: stats?.published, to: '/posts?status=published' },
    { label: 'Drafts', value: stats?.draft, to: '/posts?status=draft' },
    { label: 'Scheduled', value: stats?.scheduled, to: '/posts?status=scheduled' },
    { label: 'Pages', value: stats?.pages, to: '/pages' },
    { label: 'Media', value: stats?.media, to: '/media' },
  ]

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{session.blogTitle || session.subdomain}</h1>
          <a className="page-sub link-quiet" href={blogUrl(session)} target="_blank" rel="noreferrer">
            {session.subdomain}.bearblog.dev <Icon name="external" size={13} />
          </a>
        </div>
      </header>

      <dl className="stat-row">
        {statItems.map((s) => (
          <Link key={s.label} to={s.to} className="stat-item">
            <dt>{s.label}</dt>
            <dd>{s.value ?? <Skel w={28} h={22} />}</dd>
          </Link>
        ))}
      </dl>

      {scheduled.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Coming up</h2>
          </div>
          <ul className="rows">
            {scheduled.map((p) => (
              <li key={p.uid}>
                <Link to={`/posts/${p.uid}`} className="row-link">
                  <span className="row-title">{p.title || 'Untitled'}</span>
                  <span className="row-aside">
                    <Icon name="calendar" size={14} />
                    {fmtDate(p.published_date, true)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="two-col">
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Drafts</h2>
            <Link to="/posts?status=draft" className="link-quiet small">
              View all
            </Link>
          </div>
          {!drafts ? (
            <SkeletonRows count={4} />
          ) : drafts.length === 0 ? (
            <div className="inline-empty">
              <p>No drafts.</p>
              <Link to="/posts/new" className="btn btn-sm">
                Start a post
              </Link>
            </div>
          ) : (
            <ul className="rows">
              {drafts.map((p) => (
                <li key={p.uid}>
                  <Link to={`/posts/${p.uid}`} className="row-link">
                    <span className="row-title">{p.title || 'Untitled'}</span>
                    <span className="row-aside">{relTime(p.last_modified)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Recently published</h2>
            <Link to="/posts?status=published" className="link-quiet small">
              View all
            </Link>
          </div>
          {!published ? (
            <SkeletonRows count={4} />
          ) : published.length === 0 ? (
            <div className="inline-empty">
              <p>Nothing published yet.</p>
            </div>
          ) : (
            <ul className="rows">
              {published.map((p) => (
                <li key={p.uid}>
                  <Link to={`/posts/${p.uid}`} className="row-link">
                    <span className="row-title">{p.title || 'Untitled'}</span>
                    <span className="row-aside">{fmtDate(p.published_date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
