import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import {
  getPublicPropertiesWhere,
  getPublicPropertiesIncludeList,
  sanitizePropertiesForPublic,
} from "@/lib/api-public-helpers"

// GET /api/public/properties/rent - Récupérer tous les biens en location visibles
// Query params optionnels:
// - ?postalCode=75001 : filtrer par code postal
// - ?city=Paris : filtrer par ville
// - ?limit=20 : limiter le nombre de résultats (par défaut 50, max 100)
export async function GET(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(req.url)
      const postalCode = searchParams.get("postalCode")
      const city = searchParams.get("city")
      const limitParam = searchParams.get("limit")
      
      // Parse limit avec une valeur par défaut de 50
      const limit = limitParam ? parseInt(limitParam, 10) : 50
      const validLimit = Math.max(1, Math.min(limit, 100))

      // Construire les filtres
      const where = {
        ...getPublicPropertiesWhere(),
        transactionType: "LOCATION" as const,
        ...(postalCode || city ? {
          location: {
            ...(postalCode ? { postalCode } : {}),
            ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
          }
        } : {})
      }

      const properties = await prisma.property.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: validLimit,
        include: getPublicPropertiesIncludeList(),
      })

      // Nettoyer les données sensibles
      const sanitizedProperties = sanitizePropertiesForPublic(properties)

      return NextResponse.json({
        success: true,
        count: sanitizedProperties.length,
        filters: {
          transactionType: "LOCATION",
          ...(postalCode && { postalCode }),
          ...(city && { city }),
        },
        data: sanitizedProperties,
      })
    } catch (error) {
      console.error("Error fetching rent properties:", error)
      return NextResponse.json(
        { 
          success: false,
          error: "Erreur lors de la récupération des biens en location",
          details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
        },
        { status: 500 }
      )
    }
  })
}

