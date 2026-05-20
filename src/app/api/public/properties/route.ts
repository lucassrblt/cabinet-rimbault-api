import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import {
  getPublicPropertiesWhere,
  getPublicPropertiesIncludeList,
  sanitizePropertiesForPublic,
} from "@/lib/api-public-helpers"
import {
  Prisma,
  TransactionType,
  PropertyType,
  PropertyStatus,
  PropertyCondition,
  EnergyClass,
} from "@prisma/client"

// GET /api/public/properties - Rechercher des propriétés avec filtres
// Query params optionnels:
// - ?postalCode=75001 : filtrer par code postal
// - ?city=Paris (multi) : filtrer par ville (répétable)
// - ?transactionType=VENTE : filtrer par type de transaction (VENTE, LOCATION)
// - ?propertyType=APPARTEMENT (multi) : filtrer par type de bien (répétable)
// - ?minPrice=100000 / ?maxPrice=500000 : fourchette de prix
// - ?minSurface=50 / ?maxSurface=150 : fourchette de surface
// - ?bedrooms=3 : nombre de chambres minimum (alias: minBedrooms)
// - ?minRooms=3 : nombre de pièces minimum
// - ?minFloor=1 : étage minimum
// - ?dpe=A (multi) : filtrer par classe énergétique
// - ?hideEnergyFG=true : exclure DPE F et G (intersection avec dpe si fourni)
// - ?hasBalcony=true / ?hasTerrace=true / ?hasGarden=true / ?isFurnished=true : amenities
// - ?isExclusive=true : mandats exclusifs
// - ?condition=NEUF : état général (enum PropertyCondition)
// - ?status=DISPONIBLE (multi) : override explicite du filtre de visibilité par défaut
//   (accepte DISPONIBLE, SOUS_OFFRE, SOUS_COMPROMIS, VENDU, LOUE ; refuse ARCHIVE et BROUILLON)
// - ?sortBy=date : date, price_asc, price_desc, rent_asc, rent_desc, surface_asc, surface_desc
// - ?limit=20 : limiter le nombre de résultats (par défaut 50, max 100)
// - ?offset=0 : pagination (par défaut 0)

const PROPERTY_TYPE_VALUES = Object.values(PropertyType) as string[]
const TRANSACTION_TYPE_VALUES = Object.values(TransactionType) as string[]
const PROPERTY_CONDITION_VALUES = Object.values(PropertyCondition) as string[]
const ENERGY_CLASS_VALUES = Object.values(EnergyClass) as string[]
const ALLOWED_PUBLIC_STATUSES: PropertyStatus[] = [
  "DISPONIBLE",
  "SOUS_OFFRE",
  "SOUS_COMPROMIS",
  "VENDU",
  "LOUE",
]
const ALLOWED_SORT_BY = [
  "date",
  "price_asc",
  "price_desc",
  "rent_asc",
  "rent_desc",
  "surface_asc",
  "surface_desc",
] as const

function parseBoolean(value: string | null): boolean | null {
  if (value === null) return null
  if (value === "true") return true
  if (value === "false") return false
  return null
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: message },
    { status: 400 }
  )
}

export async function GET(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(req.url)

      // Paramètres existants (préservés à l'identique)
      const postalCode = searchParams.get("postalCode")
      const minPrice = searchParams.get("minPrice")
      const maxPrice = searchParams.get("maxPrice")
      const minSurface = searchParams.get("minSurface")
      const maxSurface = searchParams.get("maxSurface")
      const bedrooms = searchParams.get("bedrooms")
      const sortBy = searchParams.get("sortBy") || "date"

      // Multi-valeurs rétro-compatibles (.getAll renvoie [] si absent, [val] pour une occurrence)
      const propertyTypes = searchParams.getAll("propertyType")
      const cities = searchParams.getAll("city")

      // Paramètres de pagination
      const limitParam = searchParams.get("limit")
      const offsetParam = searchParams.get("offset")

      // Nouveaux paramètres
      const minBedrooms = searchParams.get("minBedrooms")
      const minRooms = searchParams.get("minRooms")
      const minFloor = searchParams.get("minFloor")
      const dpeValues = searchParams.getAll("dpe")
      const hideEnergyFGRaw = searchParams.get("hideEnergyFG")
      const hasBalconyRaw = searchParams.get("hasBalcony")
      const hasTerraceRaw = searchParams.get("hasTerrace")
      const hasGardenRaw = searchParams.get("hasGarden")
      const isFurnishedRaw = searchParams.get("isFurnished")
      const isExclusiveRaw = searchParams.get("isExclusive")
      const conditionRaw = searchParams.get("condition")
      const statusValues = searchParams.getAll("status")
      const transactionTypeRaw = searchParams.get("transactionType")

      // Validation sortBy
      if (!(ALLOWED_SORT_BY as readonly string[]).includes(sortBy)) {
        return badRequest(`Invalid value for sortBy: ${sortBy}`)
      }

      // Validation transactionType
      if (transactionTypeRaw && !TRANSACTION_TYPE_VALUES.includes(transactionTypeRaw)) {
        return badRequest(`Invalid value for transactionType: ${transactionTypeRaw}`)
      }

      // Validation propertyType (multi)
      for (const pt of propertyTypes) {
        if (!PROPERTY_TYPE_VALUES.includes(pt)) {
          return badRequest(`Invalid value for propertyType: ${pt}`)
        }
      }

      // Validation condition
      if (conditionRaw && !PROPERTY_CONDITION_VALUES.includes(conditionRaw)) {
        return badRequest(`Invalid value for condition: ${conditionRaw}`)
      }

      // Validation DPE (multi)
      for (const d of dpeValues) {
        if (!ENERGY_CLASS_VALUES.includes(d)) {
          return badRequest(`Invalid value for dpe: ${d}`)
        }
      }

      // Validation status (multi) — refuser statuts internes
      for (const s of statusValues) {
        if (!ALLOWED_PUBLIC_STATUSES.includes(s as PropertyStatus)) {
          return badRequest(`Invalid value for status: ${s}`)
        }
      }

      // Parse booléens
      const hideEnergyFG = parseBoolean(hideEnergyFGRaw)
      if (hideEnergyFGRaw !== null && hideEnergyFG === null) {
        return badRequest("Invalid value for hideEnergyFG")
      }
      const hasBalcony = parseBoolean(hasBalconyRaw)
      if (hasBalconyRaw !== null && hasBalcony === null) {
        return badRequest("Invalid value for hasBalcony")
      }
      const hasTerrace = parseBoolean(hasTerraceRaw)
      if (hasTerraceRaw !== null && hasTerrace === null) {
        return badRequest("Invalid value for hasTerrace")
      }
      const hasGarden = parseBoolean(hasGardenRaw)
      if (hasGardenRaw !== null && hasGarden === null) {
        return badRequest("Invalid value for hasGarden")
      }
      const isFurnished = parseBoolean(isFurnishedRaw)
      if (isFurnishedRaw !== null && isFurnished === null) {
        return badRequest("Invalid value for isFurnished")
      }
      const isExclusive = parseBoolean(isExclusiveRaw)
      if (isExclusiveRaw !== null && isExclusive === null) {
        return badRequest("Invalid value for isExclusive")
      }

      // Parse entiers
      const parseIntParam = (name: string, raw: string | null): number | null | NextResponse => {
        if (raw === null) return null
        const n = parseInt(raw, 10)
        if (Number.isNaN(n)) return badRequest(`Invalid value for ${name}`)
        return n
      }
      const bedroomsParsed = parseIntParam("bedrooms", bedrooms)
      if (bedroomsParsed instanceof NextResponse) return bedroomsParsed
      const minBedroomsParsed = parseIntParam("minBedrooms", minBedrooms)
      if (minBedroomsParsed instanceof NextResponse) return minBedroomsParsed
      const minRoomsParsed = parseIntParam("minRooms", minRooms)
      if (minRoomsParsed instanceof NextResponse) return minRoomsParsed
      const minFloorParsed = parseIntParam("minFloor", minFloor)
      if (minFloorParsed instanceof NextResponse) return minFloorParsed

      // Combiner bedrooms + minBedrooms (prendre le max)
      const effectiveMinBedrooms =
        bedroomsParsed !== null && minBedroomsParsed !== null
          ? Math.max(bedroomsParsed, minBedroomsParsed)
          : bedroomsParsed !== null
            ? bedroomsParsed
            : minBedroomsParsed

      // Parse pagination
      const limit = limitParam ? parseInt(limitParam, 10) : 50
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0
      const validLimit = Math.max(1, Math.min(limit, 100))
      const validOffset = Math.max(0, offset)

      // Intersection DPE + hideEnergyFG
      const F_G_HIDDEN: EnergyClass[] = ["A", "B", "C", "D", "E"]
      let dpeFilter: EnergyClass[] | null = null
      if (dpeValues.length > 0 && hideEnergyFG) {
        dpeFilter = (dpeValues as EnergyClass[]).filter((d) =>
          (F_G_HIDDEN as string[]).includes(d)
        )
      } else if (dpeValues.length > 0) {
        dpeFilter = dpeValues as EnergyClass[]
      } else if (hideEnergyFG) {
        dpeFilter = F_G_HIDDEN
      }

      // Construire le filtre status (override explicite si fourni)
      const basePublicWhere = getPublicPropertiesWhere()
      const statusClause: Prisma.PropertyWhereInput =
        statusValues.length > 0
          ? {
              status:
                statusValues.length === 1
                  ? (statusValues[0] as PropertyStatus)
                  : { in: statusValues as PropertyStatus[] },
            }
          : {}

      // Clause propertyType multi
      const propertyTypeClause: Prisma.PropertyWhereInput =
        propertyTypes.length === 1
          ? { propertyType: propertyTypes[0] as PropertyType }
          : propertyTypes.length > 1
            ? { propertyType: { in: propertyTypes as PropertyType[] } }
            : {}

      // Clause location (city multi + postalCode)
      const locationClause: Prisma.PropertyLocationWhereInput = {}
      if (postalCode) locationClause.postalCode = postalCode
      if (cities.length === 1) {
        locationClause.city = { contains: cities[0], mode: "insensitive" as const }
      } else if (cities.length > 1) {
        locationClause.OR = cities.map((c) => ({
          city: { contains: c, mode: "insensitive" as const },
        }))
      }
      const hasLocationFilter = Object.keys(locationClause).length > 0

      // Clause finance
      const financeClause: Prisma.PropertyFinanceWhereInput = {}
      if (minPrice || maxPrice) {
        financeClause.price = {
          ...(minPrice ? { gte: parseFloat(minPrice) } : {}),
          ...(maxPrice ? { lte: parseFloat(maxPrice) } : {}),
        }
      }
      const hasFinanceFilter = Object.keys(financeClause).length > 0

      // Clause characteristics
      const characteristicsClause: Prisma.PropertyCharacteristicsWhereInput = {}
      if (minSurface || maxSurface) {
        characteristicsClause.surface = {
          ...(minSurface ? { gte: parseFloat(minSurface) } : {}),
          ...(maxSurface ? { lte: parseFloat(maxSurface) } : {}),
        }
      }
      if (effectiveMinBedrooms !== null) {
        characteristicsClause.bedrooms = { gte: effectiveMinBedrooms }
      }
      if (minRoomsParsed !== null) {
        characteristicsClause.rooms = { gte: minRoomsParsed }
      }
      if (minFloorParsed !== null) {
        characteristicsClause.floor = { gte: minFloorParsed }
      }
      const hasCharacteristicsFilter = Object.keys(characteristicsClause).length > 0

      // Clause amenities
      const amenitiesClause: Prisma.PropertyAmenitiesWhereInput = {}
      if (hasBalcony === true) amenitiesClause.hasBalcony = true
      if (hasTerrace === true) amenitiesClause.hasTerrace = true
      if (hasGarden === true) amenitiesClause.hasGarden = true
      if (isFurnished === true) amenitiesClause.isFurnished = true
      const hasAmenitiesFilter = Object.keys(amenitiesClause).length > 0

      // Clause energy (DPE)
      const energyClause: Prisma.PropertyEnergyWhereInput = {}
      if (dpeFilter !== null) {
        energyClause.energyClass =
          dpeFilter.length === 1 ? dpeFilter[0] : { in: dpeFilter }
      }
      const hasEnergyFilter = Object.keys(energyClause).length > 0

      // Composition du where
      const where: Prisma.PropertyWhereInput = {
        // Base: isPublished + status par défaut (sauf override via statusClause)
        isPublished: true,
        ...(statusValues.length > 0
          ? statusClause
          : { status: basePublicWhere.status }),
        ...(transactionTypeRaw && { transactionType: transactionTypeRaw as TransactionType }),
        ...propertyTypeClause,
        ...(isExclusive === true && { isExclusive: true }),
        ...(conditionRaw && { condition: conditionRaw as PropertyCondition }),
        ...(hasLocationFilter && { location: locationClause }),
        ...(hasFinanceFilter && { finance: financeClause }),
        ...(hasCharacteristicsFilter && { characteristics: characteristicsClause }),
        ...(hasAmenitiesFilter && { amenities: amenitiesClause }),
        ...(hasEnergyFilter && { energy: energyClause }),
      }

      // Total
      const total = await prisma.property.count({ where })

      // OrderBy
      let orderBy: Prisma.PropertyOrderByWithRelationInput
      switch (sortBy) {
        case "price_asc":
        case "rent_asc":
          orderBy = { finance: { price: "asc" } }
          break
        case "price_desc":
        case "rent_desc":
          orderBy = { finance: { price: "desc" } }
          break
        case "surface_asc":
          orderBy = { characteristics: { surface: "asc" } }
          break
        case "surface_desc":
          orderBy = { characteristics: { surface: "desc" } }
          break
        case "date":
        default:
          orderBy = { createdAt: "desc" }
          break
      }

      const properties = await prisma.property.findMany({
        where,
        orderBy,
        skip: validOffset,
        take: validLimit,
        include: getPublicPropertiesIncludeList(),
      })

      const sanitizedProperties = sanitizePropertiesForPublic(properties)

      return NextResponse.json({
        success: true,
        count: sanitizedProperties.length,
        total,
        offset: validOffset,
        limit: validLimit,
        filters: {
          ...(postalCode && { postalCode }),
          ...(cities.length === 1 && { city: cities[0] }),
          ...(cities.length > 1 && { city: cities }),
          ...(transactionTypeRaw && { transactionType: transactionTypeRaw }),
          ...(propertyTypes.length === 1 && { propertyType: propertyTypes[0] }),
          ...(propertyTypes.length > 1 && { propertyType: propertyTypes }),
          ...(minPrice && { minPrice: parseFloat(minPrice) }),
          ...(maxPrice && { maxPrice: parseFloat(maxPrice) }),
          ...(minSurface && { minSurface: parseFloat(minSurface) }),
          ...(maxSurface && { maxSurface: parseFloat(maxSurface) }),
          ...(bedroomsParsed !== null && { bedrooms: bedroomsParsed }),
          ...(minBedroomsParsed !== null && { minBedrooms: minBedroomsParsed }),
          ...(minRoomsParsed !== null && { minRooms: minRoomsParsed }),
          ...(minFloorParsed !== null && { minFloor: minFloorParsed }),
          ...(dpeValues.length === 1 && { dpe: dpeValues[0] }),
          ...(dpeValues.length > 1 && { dpe: dpeValues }),
          ...(hideEnergyFG !== null && { hideEnergyFG }),
          ...(hasBalcony !== null && { hasBalcony }),
          ...(hasTerrace !== null && { hasTerrace }),
          ...(hasGarden !== null && { hasGarden }),
          ...(isFurnished !== null && { isFurnished }),
          ...(isExclusive !== null && { isExclusive }),
          ...(conditionRaw && { condition: conditionRaw }),
          ...(statusValues.length === 1 && { status: statusValues[0] }),
          ...(statusValues.length > 1 && { status: statusValues }),
        },
        data: sanitizedProperties,
      })
    } catch (error) {
      console.error("Error fetching properties:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de la récupération des propriétés",
          details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
        },
        { status: 500 }
      )
    }
  })
}
