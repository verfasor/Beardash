import { useEffect, useState } from 'react'
import { revisions, type RevisionMeta } from '../api'
import { Modal, SkeletonRows, relTime, useToast } from '../ui'

/** Local history key for the blog's Theme CSS (posts use their uid; the home page uses "_home"). */
export const STYLES_HISTORY_KEY = '_styles'

const fmt = (s: number) => new Date(s * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const lines = (css: string) => (css ? css.split('\n').length : 0)

/**
 * Saved versions of the Theme CSS, kept in this browser like post history.
 * Restoring puts the version into the editor; it reaches Bear only when you save.
 */
export function CssHistory({ open, onClose, current, onRestore }: { open: boolean; onClose: () => void; current: string; onRestore: (css: string) => void }) {
  const toast = useToast()
  const [list, setList] = useState<RevisionMeta[] | null>(null)
  const [picked, setPicked] = useState<{ id: number; content: string; created_at: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setList(null)
    setPicked(null)
    revisions
      .list(STYLES_HISTORY_KEY)
      .then((r) => {
        setList(r.revisions)
        if (r.revisions[0]) pick(r.revisions[0].id)
      })
      .catch((e) => {
        toast(e.message, 'error')
        setList([])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (id: number) =>
    revisions
      .get(STYLES_HISTORY_KEY, id)
      .then(setPicked)
      .catch((e) => toast(e.message, 'error'))

  const same = picked && picked.content.trimEnd() === current.trimEnd()

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="CSS history"
      description="A version is kept each time you save or switch themes, plus the one that was on Bear before your first edit. The last 50 are kept in this browser."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            disabled={!picked || !!same}
            onClick={() => {
              if (!picked) return
              onRestore(picked.content)
              toast('Version restored. Save to apply it.')
              onClose()
            }}
          >
            {same ? 'Same as the editor' : 'Restore this version'}
          </button>
        </>
      }
    >
      {!list ? (
        <SkeletonRows count={4} />
      ) : list.length === 0 ? (
        <p className="muted small">No saved versions yet. One is kept each time you save your CSS from Beardash.</p>
      ) : (
        <div className="css-history">
          <ol className="rev-list css-history-list">
            {list.map((r, i) => (
              <li key={r.id}>
                <button className={picked?.id === r.id ? 'on' : ''} aria-pressed={picked?.id === r.id} onClick={() => pick(r.id)}>
                  <span className="rev-time">{fmt(r.created_at)}</span>
                  <span className="rev-meta">
                    {i === 0 ? 'Latest · ' : ''}
                    {r.fromBear ? 'From Bear · ' : ''}
                    {relTime(r.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="css-history-view">
            {picked ? (
              <>
                <div className="css-history-meta muted small">
                  {lines(picked.content)} lines · {picked.content.length.toLocaleString()} characters
                </div>
                <pre className="css-history-code">{picked.content || '/* empty */'}</pre>
              </>
            ) : (
              <SkeletonRows count={3} />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
