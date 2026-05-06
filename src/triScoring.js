const A = 1.7
const C = 0.20
const THETA_MIN = -4
const THETA_MAX = 4

function difficultyToB(difficulty) {
  return (difficulty - 5.5) / 1.5
}

export function icc(a, b, c, theta) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)))
}

// Derivative of log-likelihood w.r.t. theta (used for MLE bisection)
function dLogLikelihood(items, theta) {
  return items.reduce((sum, { a, b, c, correct }) => {
    const p = icc(a, b, c, theta)
    const u = correct ? 1 : 0
    const dP = a * (p - c) * (1 - p) / (1 - c)
    const pSafe = Math.max(p, 1e-10)
    const qSafe = Math.max(1 - p, 1e-10)
    return sum + dP * (u - p) / (pSafe * qSafe)
  }, 0)
}

export function estimateTheta(items) {
  if (items.every((i) => i.correct)) return THETA_MAX
  if (items.every((i) => !i.correct)) return THETA_MIN

  // Bisection on dLL/dtheta = 0
  let lo = THETA_MIN
  let hi = THETA_MAX
  for (let i = 0; i < 100; i++) {
    if (hi - lo < 1e-6) break
    const mid = (lo + hi) / 2
    if (dLogLikelihood(items, mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function thetaToScore(theta) {
  // Linear map [-4, +4] → [100, 1000]: slope=112.5, intercept=550
  return Math.round(Math.min(1000, Math.max(100, 550 + 112.5 * theta)))
}

export function calcTriScores(questions, attempts) {
  const areas = ['math', 'nature', 'linguagens', 'humanas']
  const scores = {}

  for (const area of areas) {
    const areaQs = questions.filter(
      (q) => q.area === area && q.answer !== 'annulled'
    )
    if (areaQs.length === 0) {
      scores[area] = null
      continue
    }

    const items = areaQs.map((q) => ({
      a: A,
      b: difficultyToB(q.difficulty ?? 5),
      c: C,
      correct: attempts[q.number]?.correct ?? false,
    }))

    scores[area] = thetaToScore(estimateTheta(items))
  }

  const validScores = Object.values(scores).filter((s) => s !== null)
  scores.geral = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : null

  return scores
}
