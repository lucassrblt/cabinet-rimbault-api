import { Prisma, PrismaClient } from "@prisma/client"

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

/**
 * Nettoie les données sensibles avant de les renvoyer à l'API publique
 */
export function sanitizePropertyForPublic<T extends Record<string, unknown>>(property: T): T {
  const sanitized = { ...property }
  
  // Supprimer les notes internes
  if ("internalNotes" in sanitized) {
    delete sanitized.internalNotes
  }
  
  // Supprimer les informations utilisateur
  if ("userId" in sanitized) {
    delete sanitized.userId
  }
  if ("user" in sanitized) {
    delete sanitized.user
  }
  
  return sanitized
}

/**
 * Nettoie un tableau de propriétés
 */
export function sanitizePropertiesForPublic<T extends Record<string, unknown>>(properties: T[]): T[] {
  return properties.map(property => sanitizePropertyForPublic(property))
}

