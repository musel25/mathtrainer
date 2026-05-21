import { useState } from 'react'
import type { QuestionResult, SessionPlan } from './lib/types'
import {
  startSession, finishSession, getSessionPlan, type SessionSummary,
} from './lib/api'
import { Dashboard } from './components/Dashboard'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'
import { ProgressPage } from './components/ProgressPage'
import { SettingsPage } from './components/SettingsPage'

type Screen =
  | 'dashboard' | 'loading' | 'practice' | 'summary' | 'progress' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [plan, setPlan] = useState<SessionPlan | null>(null)
  const [results, setResults] = useState<QuestionResult[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setScreen('loading')
    setError(null)
    try {
      setPlan(await getSessionPlan())
      setScreen('practice')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScreen('dashboard')
    }
  }

  async function handleComplete(finished: QuestionResult[]) {
    setResults(finished)
    setSummary(null)
    setError(null)
    setScreen('summary')
    try {
      const sessionId = await startSession('daily')
      setSummary(await finishSession(sessionId, finished))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (screen === 'loading') {
    return <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
  }
  if (screen === 'practice' && plan) {
    return <PracticeScreen plan={plan} onComplete={handleComplete} />
  }
  if (screen === 'summary') {
    return (
      <SummaryScreen
        results={results}
        summary={summary}
        saveError={error}
        onRestart={() => setScreen('dashboard')}
      />
    )
  }
  if (screen === 'progress') {
    return <ProgressPage onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'settings') {
    return <SettingsPage onBack={() => setScreen('dashboard')} />
  }
  return (
    <Dashboard
      onStartDrill={handleStart}
      onOpenProgress={() => setScreen('progress')}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}
