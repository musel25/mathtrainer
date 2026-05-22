import { useEffect, useState } from 'react'
import type { Settings } from '../lib/types'
import { getSettings, putSettings } from '../lib/api'
import { Screen } from './ui/Screen'
import { Button } from './ui/Button'

interface Props {
  onBack: () => void
}

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
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save}>Save</Button>
            {status && <span className="text-sm text-success">{status}</span>}
          </div>
        </div>
      )}
    </Screen>
  )
}
