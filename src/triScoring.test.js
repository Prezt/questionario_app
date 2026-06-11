import { describe, it, expect } from 'vitest'
import { icc, estimateTheta, calcTriScores } from './triScoring.js'

describe('icc', () => {
  it('returns c when theta is very low (floor = guessing)', () => {
    const p = icc(1.7, 0, 0.2, -10)
    expect(p).toBeCloseTo(0.2, 2)
  })

  it('returns ~1 when theta is very high', () => {
    const p = icc(1.7, 0, 0.2, 10)
    expect(p).toBeCloseTo(1.0, 2)
  })

  it('returns ~0.6 when theta equals b (inflection point)', () => {
    // At theta = b: P = c + (1-c)/2 = 0.2 + 0.4 = 0.6
    const p = icc(1.7, 1.0, 0.2, 1.0)
    expect(p).toBeCloseTo(0.6, 2)
  })
})

describe('estimateTheta', () => {
  it('returns upper bound when all items correct', () => {
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: true },
      { a: 1.7, b:  0.0, c: 0.2, correct: true },
      { a: 1.7, b:  1.0, c: 0.2, correct: true },
    ]
    expect(estimateTheta(items)).toBe(4)
  })

  it('returns lower bound when all items wrong', () => {
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: false },
      { a: 1.7, b:  0.0, c: 0.2, correct: false },
      { a: 1.7, b:  1.0, c: 0.2, correct: false },
    ]
    expect(estimateTheta(items)).toBe(-4)
  })

  it('estimates near 0 when student got easy right and hard wrong', () => {
    // Easy (b=-1): correct. Hard (b=+1): wrong. Expect theta near 0.
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: true },
      { a: 1.7, b:  1.0, c: 0.2, correct: false },
    ]
    const theta = estimateTheta(items)
    expect(theta).toBeGreaterThan(-0.5)
    expect(theta).toBeLessThan(0.5)
  })

  it('estimates positive theta when student also got hard item right', () => {
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: true },
      { a: 1.7, b:  0.0, c: 0.2, correct: true },
      { a: 1.7, b:  1.0, c: 0.2, correct: true },
      { a: 1.7, b:  2.0, c: 0.2, correct: false },
    ]
    const theta = estimateTheta(items)
    expect(theta).toBeGreaterThan(0.5)
  })
})

describe('calcTriScores', () => {
  const makeQuestion = (number, area, difficulty, answer) => ({
    number, area, difficulty, answer,
    text: '', alternatives: {}, images: [], tags: [], year: 2023, test: 'ENEM',
  })
  const keyOf = (q) => `${q.area}:${q.year}:${q.test ?? ''}:${q.number}`

  it('returns null for areas with no questions', () => {
    const q = makeQuestion(1, 'math', 5, 'a')
    const questions = [q]
    const attempts = { [keyOf(q)]: { selected: 'a', correct: true } }
    const scores = calcTriScores(questions, attempts)
    expect(scores.nature).toBeNull()
    expect(scores.linguagens).toBeNull()
    expect(scores.humanas).toBeNull()
  })

  it('excludes annulled questions from TRI', () => {
    const q1 = makeQuestion(1, 'math', 5, 'a')
    const q2 = makeQuestion(2, 'math', 5, 'annulled')
    const questions = [q1, q2]
    const attempts = {
      [keyOf(q1)]: { selected: 'a', correct: true },
      [keyOf(q2)]: { selected: 'b', correct: false },
    }
    const scoresWithAnnulled = calcTriScores(questions, attempts)
    const questionsNoAnnulled = [q1]
    const scoresWithout = calcTriScores(questionsNoAnnulled, { [keyOf(q1)]: { selected: 'a', correct: true } })
    expect(scoresWithAnnulled.math).toBe(scoresWithout.math)
  })

  it('treats unanswered questions as wrong', () => {
    const q1 = makeQuestion(1, 'math', 5, 'a')
    const q2 = makeQuestion(2, 'math', 5, 'a')
    const questions = [q1, q2]
    const attemptsPartial = { [keyOf(q1)]: { selected: 'a', correct: true } }
    const attemptsBothWrong = {
      [keyOf(q1)]: { selected: 'a', correct: true },
      [keyOf(q2)]: { selected: 'b', correct: false },
    }
    expect(calcTriScores(questions, attemptsPartial).math)
      .toBe(calcTriScores(questions, attemptsBothWrong).math)
  })

  it('geral is average of non-null area scores', () => {
    const q1 = makeQuestion(1, 'math', 5, 'a')
    const q2 = makeQuestion(2, 'nature', 5, 'a')
    const questions = [q1, q2]
    const attempts = {
      [keyOf(q1)]: { selected: 'a', correct: true },
      [keyOf(q2)]: { selected: 'a', correct: true },
    }
    const scores = calcTriScores(questions, attempts)
    expect(scores.geral).toBe(Math.round((scores.math + scores.nature) / 2))
  })

  it('all correct gives 1000', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(i + 1, 'math', i + 1, 'a')
    )
    const attempts = Object.fromEntries(
      questions.map((q) => [keyOf(q), { selected: 'a', correct: true }])
    )
    expect(calcTriScores(questions, attempts).math).toBe(1000)
  })

  it('all wrong gives 100', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(i + 1, 'math', i + 1, 'a')
    )
    const attempts = Object.fromEntries(
      questions.map((q) => [keyOf(q), { selected: 'b', correct: false }])
    )
    expect(calcTriScores(questions, attempts).math).toBe(100)
  })

  it('distinguishes questions with same number across years (no collision)', () => {
    // Regression: previously attempts were keyed by q.number alone, so two
    // questions with the same number (e.g., from different years) collided.
    const qa = { ...makeQuestion(1, 'math', 5, 'a'), year: 2020 }
    const qb = { ...makeQuestion(1, 'math', 5, 'a'), year: 2021 }
    const questions = [qa, qb]
    const attempts = {
      [keyOf(qa)]: { selected: 'a', correct: true },
      [keyOf(qb)]: { selected: 'b', correct: false },
    }
    // With the old number-only key, both would be counted as correct.
    // With the composite key, exactly one is correct.
    const scores = calcTriScores(questions, attempts)
    // The "all correct" case scores 1000; a mixed case should be lower.
    expect(scores.math).toBeLessThan(1000)
  })
})
