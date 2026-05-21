export type Operation =
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'square' | 'percent'

export interface QuestionFeatures {
  operation: Operation
  maxOperand: number
  carries: number
  trickSlug: string | null
}

export interface Question {
  operation: Operation
  operands: number[]
  prompt: string          // e.g. "12 + 34"
  answer: number
  features: QuestionFeatures
  difficulty: number      // 1..100
}

export interface DifficultyBand {
  min: number
  max: number
}

export interface QuestionResult {
  question: Question
  givenAnswer: number | null
  isCorrect: boolean
  msToFirstKey: number | null
  msToSubmit: number
}

export interface SessionPlan {
  rating: number
  targetBand: DifficultyBand
  weakOperations: Operation[]
  sessionLength: number
}

export interface HeatmapCell {
  date: string
  score: number
  questions: number
}

export interface Dashboard {
  streak: number
  today: { questions: number; goal: number }
  rating: number
  ratingSparkline: number[]
  heatmap: HeatmapCell[]
  totalSessions: number
}

export interface ProgressPoint {
  n: number
  rating: number | null
  score: number
  accuracy: number
}

export interface OperationTime {
  operation: string
  avgMs: number
}

export interface Progress {
  history: ProgressPoint[]
  operationTimes: OperationTime[]
}

export interface Settings {
  dailyGoal: number
  sessionLength: number
}

export interface TrickStat {
  slug: string
  attempts: number
  correct: number
  proficiency: number
  lastPracticed: string | null
}
