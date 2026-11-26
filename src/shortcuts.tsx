import { Kbd, MOD } from './ui'

// Single source for keyboard shortcuts: used by the "?" modal and the Docs page.
export const SHORTCUT_GROUPS: [string, [string[], string][]][] = [
  [
    'Editor',
    [
      [[MOD, 'S'], 'Save'],
      [[MOD, 'B'], 'Bold'],
      [[MOD, 'I'], 'Italic'],
      [[MOD, 'K'], 'Insert link'],
      [[MOD, 'E'], 'Inline code'],
      [[MOD, '⇧', 'X'], 'Strikethrough'],
      [[MOD, '⇧', 'V'], 'Paste as plain text'],
      [[MOD, 'F'], 'Find'],
      [[MOD, 'Z'], 'Undo'],
    ],
  ],
  [
    'View',
    [
      [[MOD, '⇧', 'P'], 'Toggle preview'],
      [[MOD, '.'], 'Focus mode'],
      [['Esc'], 'Close panel or exit focus'],
    ],
  ],
  ['General', [[['?'], 'Show shortcuts']]],
]

export function ShortcutList() {
  return (
    <div className="shortcut-groups">
      {SHORTCUT_GROUPS.map(([name, rows]) => (
        <section key={name}>
          <h3 className="section-label">{name}</h3>
          <dl className="shortcuts">
            {rows.map(([keys, label]) => (
              <div key={label} className="shortcut-row">
                <dt>{label}</dt>
                <dd>
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
