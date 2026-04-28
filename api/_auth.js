import jwt from 'jsonwebtoken'

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the decoded payload or null if missing/invalid.
 */
export function verifyToken(req) {
  const auth = req.headers['authorization']
  if (!auth?.startsWith('Bearer ')) return null
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET)
  } catch {
    return null
  }
}
