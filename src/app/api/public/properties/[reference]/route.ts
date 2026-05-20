import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import {
  getPublicPropertiesInclude,
  sanitizePropertyForPublic,
  incrementPropertyViewCount,
} from "@/lib/api-public-helpers"

// GET /api/public/properties/[reference] - Récupérer un bien par référence
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  return withPublicApiAuth(request, async () => {
    try {
      const { reference } = await params

      const property = await prisma.property.findUnique({
        where: { reference },
        include: {
          ...getPublicPropertiesInclude(),
          documents: true,
          rooms_details: {
            orderBy: { order: "asc" },
          },
          proximities: true,
        },
      })

      if (!property) {
        return NextResponse.json(
          { 
            success: false,
            error: "Bien non trouvé" 
          },
          { status: 404 }
        )
      }

      // Vérifier que le bien est publié et disponible
      if (!property.isPublished || !["DISPONIBLE", "SOUS_OFFRE", "SOUS_COMPROMIS"].includes(property.status)) {
        return NextResponse.json(
          { 
            success: false,
            error: "Bien non disponible" 
          },
          { status: 404 }
        )
      }

      // Incrémenter le compteur de vues (sans attendre)
      incrementPropertyViewCount(prisma, property.id)

      // Nettoyer les données sensibles
      const sanitizedProperty = sanitizePropertyForPublic(property)

      return NextResponse.json({
        success: true,
        data: sanitizedProperty,
      })
    } catch (error) {
      console.error("Error fetching property by reference:", error)
      return NextResponse.json(
        { 
          success: false,
          error: "Erreur lors de la récupération du bien",
          details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
        },
        { status: 500 }
      )
    }
  })
}

