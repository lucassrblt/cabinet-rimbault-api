/**
 * Rate limiting simple en mémoire (fenêtre glissante par clé).
 *
 * L'état vit dans la mémoire du process Node : suffisant tant que l'API tourne
 * sur une instance Railway unique. Avec plusieurs instances (ou un redémarrage),
 * chaque process a ses propres compteurs — il faudrait alors un store partagé
 * (Redis, Postgres…).
 */

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number }

export interface RateLimiter {
  check(key: string): RateLimitResult
}

export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const { limit, windowMs } = options
  // clé → timestamps (ms) des requêtes acceptées dans la fenêtre
  const hits = new Map<string, number[]>()
  let lastCleanup = Date.now()

  // Supprime les entrées expirées pour que la Map ne grossisse pas indéfiniment
  function cleanup(now: number) {
    for (const [key, timestamps] of hits) {
      const recent = timestamps.filter((t) => now - t < windowMs)
      if (recent.length > 0) {
        hits.set(key, recent)
      } else {
        hits.delete(key)
      }
    }
    lastCleanup = now
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now()
      if (now - lastCleanup >= windowMs) cleanup(now)

      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)

      if (recent.length >= limit) {
        hits.set(key, recent)
        // La plus ancienne requête de la fenêtre libère une place à son expiration
        const retryAfterMs = recent[0] + windowMs - now
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
      }

      recent.push(now)
      hits.set(key, recent)
      return { allowed: true, remaining: limit - recent.length }
    },
  }
}

/**
 * IP du client : premier IP de `x-forwarded-for`, sinon `x-real-ip`.
 * Retourne "unknown" si aucun header n'est présent (toutes ces requêtes partagent
 * alors le même compteur).
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")
  const first = forwardedFor?.split(",")[0]?.trim()
  if (first) return first

  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  return "unknown"
}
