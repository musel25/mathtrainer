import { useEffect, useState } from 'react'
import type { Operation, Settings } from '../lib/types'
import { getSettings, putSettings } from '../lib/api'
import { Screen } from './ui/Screen'
import { Button } from './ui/Button'

interface Props {
  onBack: () => void
}

const DRILL_TYPES: { op: Operation; label: string }[] = [
  { op: 'add', label: 'Addition' },
  { op: 'subtract', label: 'Subtraction' },
  { op: 'multiply', label: 'Multiplication' },
  { op: 'divide', label: 'Division' },
  { op: 'square', label: 'Squaring' },
  { op: 'percent', label: 'Percentages' },
]

const FIELD = 'mt-1.5 block w-32 rounded-md border border-border-strong '
  + 'bg-surface px-3 py-2 font-mono text-lg text-text caret-accent '
  + 'outline-none focus:border-accent'

export function SettingsPage({ onBack }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function save() {
    if (!settings) return
    setStatus(null)
    setError(null)
    try {
      await putSettings(settings)
      setStatus('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function update(patch: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    setStatus(null)
  }

  function toggleOperation(op: Operation, on: boolean) {
    setSettings((s) => {
      if (!s) return s
      const next = on
        ? [...s.enabledOperations, op]
        : s.enabledOperations.filter((o) => o !== op)
      // never leave zero operations enabled
      if (next.length === 0) return s
      // keep canonical order so the saved list is stable
      const enabledOperations = DRILL_TYPES
        .map((d) => d.op)
        .filter((o) => next.includes(o))
      return { ...s, enabledOperations }
    })
    setStatus(null)
  }

  return (
    <Screen title="Settings" onBack={onBack} width={420}>
      {error && <p className="text-error">{error}</p>}
      {!error && !settings && <p className="text-muted">Loading…</p>}

      {settings && (
        <div className="flex flex-col gap-5">
          <label className="block text-sm text-text">
            Daily goal (questions per day)
            <input
              type="number" min={1}
              value={settings.dailyGoal}
              onChange={(e) => update({ dailyGoal: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="block text-sm text-text">
            Questions per drill
            <input
              type="number" min={1} max={50}
              value={settings.sessionLength}
              onChange={(e) => update({ sessionLength: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <fieldset className="block text-sm text-text">
            <legend className="mb-2">Drill types</legend>
            <p className="mb-2.5 text-xs text-muted">
              Which operations appear in your daily drills. At least one is
              required.
            </p>
            <div className="flex flex-col gap-2">
              {DRILL_TYPES.map(({ op, label }) => {
                const checked = settings.enabledOperations.includes(op)
                // disable the last remaining box so it can't be unchecked
                const isLast = checked && settings.enabledOperations.length === 1
                return (
                  <label key={op} className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isLast}
                      onChange={(e) => toggleOperation(op, e.target.checked)}
                      className="h-4 w-4 accent-accent disabled:opacity-50"
                    />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save}>Save</Button>
            {status && <span className="text-sm text-success">{status}</span>}
          </div>
        </div>
      )}
    </Screen>
  )
}
