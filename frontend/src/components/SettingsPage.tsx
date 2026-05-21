import { useEffect, useState } from 'react'
import type { Settings } from '../lib/types'
import { getSettings, putSettings } from '../lib/api'

interface Props {
  onBack: () => void
}

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
    <div style={{ maxWidth: 420, margin: '8vh auto', padding: '0 16px' }}>
      <button onClick={onBack} style={{ padding: '6px 14px' }}>← Back</button>
      <h2 style={{ textAlign: 'center' }}>Settings</h2>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!error && !settings && <p>Loading…</p>}

      {settings && (
        <>
          <label style={{ display: 'block', margin: '16px 0' }}>
            Daily goal (questions per day)
            <input
              type="number" min={1}
              value={settings.dailyGoal}
              onChange={(e) => update({ dailyGoal: Number(e.target.value) })}
              style={{ display: 'block', fontSize: 18, width: 120, marginTop: 4 }}
            />
          </label>
          <label style={{ display: 'block', margin: '16px 0' }}>
            Questions per drill
            <input
              type="number" min={1} max={50}
              value={settings.sessionLength}
              onChange={(e) => update({ sessionLength: Number(e.target.value) })}
              style={{ display: 'block', fontSize: 18, width: 120, marginTop: 4 }}
            />
          </label>
          <button onClick={save} style={{ fontSize: 16, padding: '8px 20px' }}>
            Save
          </button>
          {status && <span style={{ color: 'green', marginLeft: 12 }}>{status}</span>}
        </>
      )}
    </div>
  )
}
