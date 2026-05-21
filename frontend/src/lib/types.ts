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
}
