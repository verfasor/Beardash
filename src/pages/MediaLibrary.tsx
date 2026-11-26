import { useCallback, useEffect, useRef, useState } from 'react'
import { bear, cached, type MediaItem, type MediaType } from '../api'
import { mediaMarkdown } from '../components/CodeEditor'
import { Icon, Skel, skelWidth, Empty, Modal, fmtDate, useToast, useConfirm, copy } from '../ui'

const TYPES: { key: MediaType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'document', label: 'Documents' },
  { key: 'font', label: 'Fonts' },
]

function snippet(m: MediaItem) {
  return mediaMarkdown({ url: m.url, name: m.name, type: m.type })
}

export function MediaLibrary() {
  const toast = useToast()
  const confirm = useConfirm()
  const [type, setType] = useState<MediaType | 'all'>('all')
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [count, setCount] = useState(0)
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [raw, setRaw] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [detail, setDetail] = useState<MediaItem | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (page: number) => {
      const res = await bear.listMedia({ page, type: type === 'all' ? undefined : type })
      setCount(res.count)
      setNextPage(res.next_page)
      setItems((prev) => (page === 1 ? res.media : [...(prev ?? []), ...res.media]))
    },
    [type],
  )

  useEffect(() => {
    const hit = cached.media({ page: 1, type: type === 'all' ? undefined : type })
    setItems(hit?.media ?? null)
    if (hit) setCount(hit.count)
    load(1).catch((e) => {
      toast(e.message, 'error')
      setItems([])
    })
  }, [load, toast])

  const uploadFiles = async (files: File[]) => {
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        toast(`${f.name} is larger than 10 MB`, 'error')
        continue
      }
      setUploading((u) => [...u, f.name])
      try {
        const m = await bear.uploadMedia(f, raw)
        setItems((prev) => [m, ...(prev ?? [])])
        setCount((c) => c + 1)
        toast(`Uploaded ${m.name}`)
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, 'error')
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name))
      }
    }
  }

  const remove = async (m: MediaItem) => {
    const ok = await confirm({
      title: `Delete ${m.name}?`,
      body: "Posts that use this file will show a broken image or link. This can't be undone.",
      confirm: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await bear.deleteMedia(m.id)
      setItems((prev) => prev?.filter((x) => x.id !== m.id) ?? null)
      setCount((c) => c - 1)
      setDetail(null)
      toast('Deleted')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div
      className="page page-wide"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        uploadFiles([...e.dataTransfer.files])
      }}
    >
      <header className="page-header page-header-media">
        <div>
          <h1 className="page-title">Media</h1>
          <p className="page-sub">Up to 10 MB per file, 100 uploads a day.</p>
        </div>
        <div className="header-actions">
          <label className="check check-inline" title="Without this, Bear resizes images to 1200px wide and converts them to WebP.">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
            <span>Keep originals</span>
          </label>
          <button className="btn btn-primary" onClick={() => input.current?.click()}>
            <Icon name="upload" /> Upload
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              uploadFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="list-toolbar">
        <div className="tabs" role="tablist">
          {TYPES.map((t) => (
            <button key={t.key} role="tab" aria-selected={type === t.key} className={type === t.key ? 'on' : ''} onClick={() => setType(t.key)}>
              {t.label}
              {type === t.key && (items ? <span className="tab-count">{count}</span> : <Skel w={16} h={9} className="tab-count-skel" />)}
            </button>
          ))}
        </div>
      </div>

      {uploading.length > 0 && (
        <div className="notice">
          <span className="spinner" />
          <span>
            Uploading {uploading.length === 1 ? uploading[0] : `${uploading.length} files`}…
          </span>
        </div>
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <Icon name="upload" size={22} />
          Drop to upload
        </div>
      )}

      {!items ? (
        <ul className="media-grid" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i} className="media-tile">
              <Skel className="media-thumb-skel" />
              <Skel w={skelWidth(i, 0.9)} h={11} />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <Empty title="No files yet">
          <p className="muted small">Drag files onto this page, or paste images into a post.</p>
        </Empty>
      ) : (
        <ul className="media-grid">
          {items.map((m) => (
            <li key={m.id}>
              <button className="media-tile" onClick={() => setDetail(m)} aria-label={`Open ${m.name}`}>
                <span className="media-thumb">
                  {m.type === 'image' ? (
                    <img src={m.url} alt="" loading="lazy" />
                  ) : (
                    <span className="media-ext">
                      <Icon name="file" size={22} />
                      {m.name.split('.').pop()?.toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="media-name">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items && nextPage && (
        <div className="load-more">
          <button className="btn" onClick={() => load(nextPage).catch((e) => toast(e.message, 'error'))}>
            Load more
          </button>
        </div>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail?.name}
        description={detail ? `${detail.type[0].toUpperCase() + detail.type.slice(1)} · uploaded ${fmtDate(detail.created_at)}` : ''}
        footer={
          detail && (
            <>
              <button className="btn btn-danger-quiet" onClick={() => remove(detail)}>
                <Icon name="trash" /> Delete
              </button>
              <span className="spacer" />
              <a className="btn" href={detail.url} target="_blank" rel="noreferrer">
                <Icon name="external" /> Open
              </a>
              <button className="btn btn-primary" onClick={() => copy(snippet(detail), toast, 'Embed code copied')}>
                <Icon name="copy" /> Copy embed
              </button>
            </>
          )
        }
      >
        {detail && (
          <div className="media-detail">
            <div className="media-detail-preview">
              {detail.type === 'image' ? (
                <img src={detail.url} alt={detail.name} />
              ) : detail.type === 'video' ? (
                <video src={detail.url} controls />
              ) : detail.type === 'audio' ? (
                <audio src={detail.url} controls />
              ) : (
                <span className="media-ext">
                  <Icon name="file" size={32} />
                  {detail.name.split('.').pop()?.toUpperCase()}
                </span>
              )}
            </div>
            <label className="field">
              <span className="label">URL</span>
              <div className="input-group">
                <input readOnly value={detail.url} onFocus={(e) => e.target.select()} />
                <button className="input-btn" onClick={() => copy(detail.url, toast, 'URL copied')} aria-label="Copy URL">
                  <Icon name="copy" size={15} />
                </button>
              </div>
            </label>
            <label className="field">
              <span className="label">Embed</span>
              <div className="input-group">
                <input readOnly className="mono-input" value={snippet(detail)} onFocus={(e) => e.target.select()} />
                <button className="input-btn" onClick={() => copy(snippet(detail), toast, 'Embed code copied')} aria-label="Copy embed">
                  <Icon name="copy" size={15} />
                </button>
              </div>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
