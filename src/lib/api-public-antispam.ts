import { randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createRateLimiter, getClientIp, type RateLimiter } from "@/lib/rate-limit"

/**
 * Anti-spam des endpoints POST publics (contact, évaluation) :
 * - rate limit en mémoire par IP et par endpoint (cf. src/lib/rate-limit.ts)
 * - honeypot : champ `website` invisible côté vitrine, rempli uniquement par les bots
 */

// 5 requêtes par 10 minutes, par IP et par endpoint
const PUBLIC_POST_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 }

export function createPublicPostRateLimiter(): RateLimiter {
  return createRateLimiter(PUBLIC_POST_RATE_LIMIT)
}

/**
 * Vérifie le rate limit pour la requête. Retourne une réponse 429 si la limite
 * est atteinte, null sinon.
 */
export function enforceRateLimit(limiter: RateLimiter, request: NextRequest): NextResponse | null {
  const result = limiter.check(getClientIp(request.headers))
  if (result.allowed) return null

  return NextResponse.json(
    { success: false, error: "Trop de demandes, réessayez dans quelques minutes." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  )
}

/**
 * Honeypot : vrai si le champ `website` du body est renseigné.
 */
export function isHoneypotFilled(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const value = (body as Record<string, unknown>).website
  if (value == null) return false
  return String(value).trim() !== ""
}

/**
 * Réponse renvoyée quand le honeypot est déclenché : identique à un succès
 * (201, même forme) pour ne pas signaler au bot qu'il a été détecté.
 * Rien n'est enregistré ni envoyé.
 */
export function honeypotSuccessResponse(message: string): NextResponse {
  // Identifiant factice au format cuid (même allure que les vrais ids)
  const fakeId = `c${randomBytes(12).toString("hex")}`
  return NextResponse.json(
    {
      success: true,
      message,
      data: {
        id: fakeId,
        createdAt: new Date(),
      },
    },
    { status: 201 },
  )
}
