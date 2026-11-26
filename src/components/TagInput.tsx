import { useState } from 'react'
import { Icon } from '../ui'

export function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .filter((t) => !value.includes(t))
    if (tags.length) onChange([...value, ...tags])
    setDraft('')
  }
  return (
    <div className="tag-input" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {value.map((t) => (
        <span key={t} className="tag-chip">
          #{t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={value.length ? '' : 'Add tags…'}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) add(e.target.value)
          else setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => draft && add(draft)}
      />
    </div>
  )
}
