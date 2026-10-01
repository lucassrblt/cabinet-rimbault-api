import type { DocumentType, Prisma, PrismaClient } from "@prisma/client"

/**
 * Filtre de base pour les propriétés visibles publiquement
 * Les propriétés doivent être publiées pour être visibles
 */
export const getPublicPropertiesWhere = (): Prisma.PropertyWhereInput => {
  return {
    isPublished: true,
    status: {
      in: ["DISPONIBLE", "SOUS_OFFRE", "SOUS_COMPROMIS"],
    },
  }
}

/**
 * Liste blanche des types de documents exposés sur la fiche bien publique.
 * Tout autre type (diagnostics amiante/plomb/électricité/gaz/termites, ERNMT,
 * PV d'AG, règlement et carnet d'entretien de copropriété, fiche descriptive,
 * AUTRE…) reste interne : ces pièces contiennent en général l'adresse exacte
 * du bien ou des informations sur les copropriétaires.
 *
 * - LABEL_PDF : étiquettes énergie générées pour la vitrine
 * - DPE : diagnostic de performance énergétique
 * - PLAN : plans du bien
 * - DPE_IMAGE / GES_IMAGE : images des étiquettes DPE et GES. Elles ne sont
 *   stockées QUE dans PropertyDocument (PropertyEnergy n'a que les classes et
 *   valeurs) ; les exclure retirerait les étiquettes, dont l'affichage est une
 *   obligation légale.
 */
export const PUBLIC_DOCUMENT_TYPES: DocumentType[] = [
  "LABEL_PDF",
  "DPE",
  "PLAN",
  "DPE_IMAGE",
  "GES_IMAGE",
]

/**
 * Options d'inclusion standard pour les propriétés publiques
 * Inclut toutes les relations nécessaires pour afficher un bien
 */
export const getPublicPropertiesInclude = (): Prisma.PropertyInclude => {
  return {
    finance: true,
    location: true,
    characteristics: true,
    amenities: true,
    energy: true,
    copro: true,
    images: {
      orderBy: { order: "asc" as const },
    },
  }
}

/**
 * Options d'inclusion limitée pour les listes (performance optimisée)
 * Limite le nombre d'images pour les listes de propriétés
 */
export const getPublicPropertiesIncludeList = (): Prisma.PropertyInclude => {
  return {
    finance: true,
    location: true,
    characteristics: true,
    amenities: true,
    energy: true,
    copro: true,
    images: {
      orderBy: { order: "asc" as const },
      take: 5,
    },
  }
}

/**
 * Incrémente le compteur de vues d'une propriété
 */
export async function incrementPropertyViewCount(prisma: PrismaClient, propertyId: string) {
  try {
    await prisma.property.update({
      where: { id: propertyId },
      data: { viewCount: { increment: 1 } },
    })
  } catch (error) {
    console.error("Erreur lors de l'incrémentation du compteur de vues:", error)
    // On ne fait pas échouer la requête si l'incrémentation échoue
  }
}

// Champs internes de Property jamais exposés publiquement
const INTERNAL_PROPERTY_FIELDS = [
  "internalNotes",
  "userId",
  "user",
  "viewCount",
  "contactCount",
  "favoriteCount",
  "isPublished",
] as const
type InternalPropertyField = (typeof INTERNAL_PROPERTY_FIELDS)[number]

// Champs de localisation qui permettent d'identifier précisément le bien
const SENSITIVE_LOCATION_FIELDS = [
  "address",
  "addressComplement",
  "cadastralRef",
  "latitude",
  "longitude",
] as const
type SensitiveLocationField = (typeof SENSITIVE_LOCATION_FIELDS)[number]

// Coordonnées arrondies à 2 décimales (≈ 1 km) : suffisant pour une carte de secteur,
// insuffisant pour retrouver l'adresse exacte
export type ApproximateCoordinates = { latitude: number; longitude: number }

type LocationInput = {
  latitude?: number | null
  longitude?: number | null
}

export type PublicPropertyLocation<L extends LocationInput> = Omit<L, SensitiveLocationField> & {
  approximate: ApproximateCoordinates | null
}

// `location` est `PropertyLocation | null` quand la relation est incluse : le conditionnel
// distribue sur l'union et préserve le `null`
type MapLocation<L> = L extends LocationInput ? PublicPropertyLocation<L> : L

export type PublicProperty<T> = Omit<T, InternalPropertyField | "location"> &
  ("location" extends keyof T ? { location: MapLocation<T["location"]> } : unknown)

const roundCoordinate = (value: number) => Math.round(value * 100) / 100

/**
 * Remplace l'adresse et les coordonnées exactes par des coordonnées approximatives
 */
export function sanitizeLocationForPublic<L extends LocationInput>(
  location: L,
): PublicPropertyLocation<L> {
  const sanitized: Record<string, unknown> = { ...location }
  for (const field of SENSITIVE_LOCATION_FIELDS) {
    delete sanitized[field]
  }

  const { latitude, longitude } = location
  sanitized.approximate =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
      : null

  return sanitized as PublicPropertyLocation<L>
}

/**
 * Nettoie les données sensibles avant de les renvoyer à l'API publique :
 * - champs internes (notes, utilisateur, compteurs, flag de publication)
 * - adresse exacte, référence cadastrale et coordonnées précises (cf. `location.approximate`)
 *
 * Point de passage unique de TOUS les endpoints publics qui renvoient des biens.
 */
export function sanitizePropertyForPublic<T extends Record<string, unknown>>(
  property: T,
): PublicProperty<T> {
  const sanitized: Record<string, unknown> = { ...property }

  for (const field of INTERNAL_PROPERTY_FIELDS) {
    delete sanitized[field]
  }

  const location = sanitized.location
  if (location && typeof location === "object") {
    sanitized.location = sanitizeLocationForPublic(location as LocationInput)
  }

  return sanitized as PublicProperty<T>
}

/**
 * Nettoie un tableau de propriétés
 */
export function sanitizePropertiesForPublic<T extends Record<string, unknown>>(
  properties: T[],
): PublicProperty<T>[] {
  return properties.map((property) => sanitizePropertyForPublic(property))
}
