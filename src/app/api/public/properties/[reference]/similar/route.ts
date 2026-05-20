import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import {
  getPublicPropertiesWhere,
  getPublicPropertiesIncludeList,
  sanitizePropertiesForPublic,
} from "@/lib/api-public-helpers"
import { Prisma } from "@prisma/client"

// GET /api/public/properties/[reference]/similar
// Retourne jusqu'à `limit` biens similaires au bien référencé.
// Stratégie de fallback progressif : même ville + prix/surface ±20 %,
// puis même ville seul, puis même code postal, puis même département,
// puis juste même transactionType/propertyType.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  return withPublicApiAuth(request, async (req) => {
    try {
      const { reference } = await params
      const { searchParams } = new URL(req.url)

      const limitParam = searchParams.get("limit")
      const parsedLimit = limitParam ? parseInt(limitParam, 10) : 3
      if (Number.isNaN(parsedLimit)) {
        return NextResponse.json(
          { success: false, error: "Invalid value for limit" },
          { status: 400 }
        )
      }
      const limit = Math.max(1, Math.min(parsedLimit, 10))

      const source = await prisma.property.findUnique({
        where: { reference },
        include: {
          location: true,
          characteristics: true,
          finance: true,
        },
      })

      if (!source) {
        return NextResponse.json(
          { success: false, error: "Bien non trouvé" },
          { status: 404 }
        )
      }

      if (
        !source.isPublished ||
        !["DISPONIBLE", "SOUS_OFFRE", "SOUS_COMPROMIS"].includes(source.status)
      ) {
        return NextResponse.json(
          { success: false, error: "Bien non disponible" },
          { status: 404 }
        )
      }

      const sourcePrice = source.finance?.price ?? null
      const sourceSurface = source.characteristics?.surface ?? null
      const city = source.location?.city ?? null
      const postalCode = source.location?.postalCode ?? null
      const department = source.location?.department ?? null

      const baseWhere: Prisma.PropertyWhereInput = {
        ...getPublicPropertiesWhere(),
        id: { not: source.id },
        transactionType: source.transactionType,
        propertyType: source.propertyType,
      }

      const priceClause =
        sourcePrice !== null
          ? { price: { gte: sourcePrice * 0.8, lte: sourcePrice * 1.2 } }
          : undefined
      const surfaceClause =
        sourceSurface !== null
          ? { surface: { gte: sourceSurface * 0.8, lte: sourceSurface * 1.2 } }
          : undefined

      const cityClause = city
        ? { location: { city: { equals: city, mode: "insensitive" as const } } }
        : undefined
      const postalCodeClause = postalCode
        ? { location: { postalCode } }
        : undefined
      const departmentClause = department
        ? { location: { department } }
        : undefined

      const tiers: Prisma.PropertyWhereInput[] = []

      // Tier 1 : même ville + prix ±20 % + surface ±20 %
      if (cityClause && (priceClause || surfaceClause)) {
        tiers.push({
          ...baseWhere,
          ...cityClause,
          ...(priceClause && { finance: priceClause }),
          ...(surfaceClause && { characteristics: surfaceClause }),
        })
      }

      // Tier 2 : même ville sans contrainte prix/surface
      if (cityClause) {
        tiers.push({ ...baseWhere, ...cityClause })
      }

      // Tier 3 : même code postal
      if (postalCodeClause) {
        tiers.push({ ...baseWhere, ...postalCodeClause })
      }

      // Tier 4 : même département
      if (departmentClause) {
        tiers.push({ ...baseWhere, ...departmentClause })
      }

      // Tier 5 : transactionType + propertyType uniquement
      tiers.push(baseWhere)

      const collected: Array<Awaited<ReturnType<typeof prisma.property.findMany>>[number]> = []
      const seen = new Set<string>()

      for (const where of tiers) {
        if (collected.length >= limit) break
        const remaining = limit - collected.length
        const excludeIds = Array.from(seen)
        const tierResults = await prisma.property.findMany({
          where: excludeIds.length > 0
            ? { AND: [where, { id: { notIn: excludeIds } }] }
            : where,
          orderBy: { createdAt: "desc" },
          take: remaining,
          include: getPublicPropertiesIncludeList(),
        })
        for (const p of tierResults) {
          if (!seen.has(p.id)) {
            seen.add(p.id)
            collected.push(p)
            if (collected.length >= limit) break
          }
        }
      }

      const sanitized = sanitizePropertiesForPublic(collected)

      return NextResponse.json({
        success: true,
        count: sanitized.length,
        data: sanitized,
      })
    } catch (error) {
      console.error("Error fetching similar properties:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de la récupération des biens similaires",
          details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
        },
        { status: 500 }
      )
    }
  })
}
