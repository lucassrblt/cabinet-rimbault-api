import { type NextRequest, NextResponse } from "next/server"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import {
  getPublicPropertiesIncludeList,
  getPublicPropertiesWhere,
  sanitizePropertiesForPublic,
} from "@/lib/api-public-helpers"
import { prisma } from "@/lib/prisma"

// GET /api/public/properties/recent - Récupérer les derniers biens visibles
// Query params: ?limit=5 (par défaut 5, max 20)
export async function GET(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(req.url)
      const limitParam = searchParams.get("limit")

      // Parse limit avec une valeur par défaut de 5
      const limit = limitParam ? parseInt(limitParam, 10) : 5

      // Validation du limit (minimum 1, maximum 20)
      const validLimit = Math.max(1, Math.min(limit, 20))

      const properties = await prisma.property.findMany({
        where: getPublicPropertiesWhere(),
        orderBy: { createdAt: "desc" },
        take: validLimit,
        include: getPublicPropertiesIncludeList(),
      })

      // Nettoyer les données sensibles
      const sanitizedProperties = sanitizePropertiesForPublic(properties)

      return NextResponse.json({
        success: true,
        count: sanitizedProperties.length,
        data: sanitizedProperties,
      })
    } catch (error) {
      console.error("Error fetching recent properties:", error)

      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de la récupération des derniers biens",
          details:
            process.env.NODE_ENV === "development"
              ? error instanceof Error
                ? error.message
                : String(error)
              : undefined,
        },
        { status: 500 },
      )
    }
  })
}
