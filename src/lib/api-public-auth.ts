import { NextRequest, NextResponse } from "next/server"

/**
 * Vérifie l'authentification de l'API publique via API Key
 * L'API Key doit être fournie dans le header 'X-API-Key'
 */
export function verifyPublicApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("X-API-Key")
  const validApiKey = process.env.PUBLIC_API_KEY

  // Si aucune API Key n'est configurée, on refuse l'accès par sécurité
  if (!validApiKey) {
    console.error("PUBLIC_API_KEY n'est pas configurée dans les variables d'environnement")
    return false
  }

  // Vérifier que l'API Key correspond
  return apiKey === validApiKey
}

/**
 * Middleware pour protéger les routes API publiques
 * Retourne une réponse d'erreur si l'authentification échoue
 */
export function requirePublicApiKey(request: NextRequest): NextResponse | null {
  if (!verifyPublicApiKey(request)) {
    return NextResponse.json(
      { error: "Non autorisé - API Key invalide ou manquante" },
      { status: 401 }
    )
  }
  return null
}

/**
 * Wrapper pour les routes API qui nécessitent une authentification
 * Usage: export async function GET(request: Request) { return withPublicApiAuth(request, handler) }
 */
export async function withPublicApiAuth(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const authError = requirePublicApiKey(request)
  if (authError) {
    return authError
  }
  return handler(request)
}

