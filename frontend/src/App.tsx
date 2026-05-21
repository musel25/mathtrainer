import { useState } from 'react'
import type { QuestionResult } from './lib/types'
import { startSession, finishSession, type SessionSummary } from './lib/api'
import { StartScreen } from './components/StartScreen'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'

type Screen = 'start' | 'practice' | 'summary'

export default function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [results, setResults] = useState<QuestionResult[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleComplete(finished: QuestionResult[]) {
    setResults(finished)
    setSummary(null)
    setSaveError(null)
    setScreen('summary')
    try {
      const sessionId = await startSession('daily')
      const result = await finishSession(sessionId, finished)
      setSummary(result)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  if (screen === 'start') {
    return <StartScreen onStart={() => setScreen('practice')} />
  }
  if (screen === 'practice') {
    return <PracticeScreen onComplete={handleComplete} />
  }
  return (
    <SummaryScreen
      results={results}
      summary={summary}
      saveError={saveError}
      onRestart={() => setScreen('start')}
    />
  )
}
