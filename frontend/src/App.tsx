import { useState } from 'react'
import type { Question, QuestionResult } from './lib/types'
import {
  startSession, finishSession, getSessionPlan, type SessionSummary,
} from './lib/api'
import { generateQuestion } from './lib/questionGenerator'
import type { Trick } from './lib/tricks'
import { Dashboard } from './components/Dashboard'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'
import { ProgressPage } from './components/ProgressPage'
import { SettingsPage } from './components/SettingsPage'
import { TricksPage } from './components/TricksPage'

type Screen =
  | 'dashboard' | 'loading' | 'practice' | 'summary'
  | 'progress' | 'settings' | 'tricks'

interface Practice {
  source: () => Question
  total: number
  mode: 'daily' | 'learn'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [practice, setPractice] = useState<Practice | null>(null)
  const [results, setResults] = useState<QuestionResult[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setScreen('loading')
    setError(null)
    try {
      const plan = await getSessionPlan()
      setPractice({
        source: () =>
          generateQuestion(plan.targetBand, Math.random, plan.operationRatings),
        total: plan.sessionLength,
        mode: 'daily',
      })
      setScreen('practice')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScreen('dashboard')
    }
  }

  function handleLearn(trick: Trick) {
    setPractice({
      source: () => trick.generate(Math.random), total: 8, mode: 'learn',
    })
    setScreen('practice')
  }

  async function handleComplete(finished: QuestionResult[]) {
    setResults(finished)
    setSummary(null)
    setError(null)
    setScreen('summary')
    try {
      const sessionId = await startSession(practice?.mode ?? 'daily')
      setSummary(await finishSession(sessionId, finished))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (screen === 'loading') {
    return <p className="py-32 text-center text-muted">Loading…</p>
  }
  if (screen === 'practice' && practice) {
    return (
      <PracticeScreen
        questionSource={practice.source}
        total={practice.total}
        onComplete={handleComplete}
      />
    )
  }
  if (screen === 'summary') {
    return (
      <SummaryScreen
        results={results}
        summary={summary}
        saveError={error}
        onHome={() => setScreen('dashboard')}
        onDrillAgain={() => {
          setResults([])
          setSummary(null)
          setError(null)
          setScreen(practice ? 'practice' : 'dashboard')
        }}
      />
    )
  }
  if (screen === 'progress') {
    return <ProgressPage onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'settings') {
    return <SettingsPage onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'tricks') {
    return (
      <TricksPage onBack={() => setScreen('dashboard')} onLearn={handleLearn} />
    )
  }
  return (
    <Dashboard
      onStartDrill={handleStart}
      onOpenProgress={() => setScreen('progress')}
      onOpenSettings={() => setScreen('settings')}
      onOpenTricks={() => setScreen('tricks')}
    />
  )
}
