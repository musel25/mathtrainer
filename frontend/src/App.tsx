import { useState } from 'react'
import type { QuestionResult, SessionPlan } from './lib/types'
import {
  startSession, finishSession, getSessionPlan, type SessionSummary,
} from './lib/api'
import { StartScreen } from './components/StartScreen'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'

type Screen = 'start' | 'loading' | 'practice' | 'summary'

export default function App() {
  const [screen, setScreen] = useState<Screen>('start')
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
      setScreen('start')
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

  if (screen === 'start') {
    return <StartScreen onStart={handleStart} error={error} />
  }
  if (screen === 'loading') {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
    )
  }
  if (screen === 'practice' && plan) {
    return <PracticeScreen plan={plan} onComplete={handleComplete} />
  }
  return (
    <SummaryScreen
      results={results}
      summary={summary}
      saveError={error}
      onRestart={() => setScreen('start')}
    />
  )
}
