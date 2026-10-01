import type { Prisma, PrismaClient } from "@prisma/client"

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
 * Types de documents qui sont en réalité les étiquettes énergie générées.
 * Ils ne doivent pas apparaître dans la liste des documents à télécharger :
 * ils sont remontés à plat dans `energy.dpeImageUrl` / `energy.gesImageUrl`.
 */
export const ENERGY_LABEL_DOCUMENT_TYPES = ["DPE_IMAGE", "GES_IMAGE"] as const

/**
 * Inclusion des seules étiquettes énergie.
 * L'index composite `[propertyId, type]` rend ce filtre performant, y compris
 * en liste.
 */
const energyLabelDocumentsInclude = (): Prisma.Property$documentsArgs => ({
  where: { type: { in: [...ENERGY_LABEL_DOCUMENT_TYPES] } },
  select: { url: true, type: true },
})

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
    documents: energyLabelDocumentsInclude(),
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
    documents: energyLabelDocumentsInclude(),
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

/** Un document tel qu'exposé publiquement : ni identifiant interne, ni poids. */
interface PublicDocument {
  id?: string
  url: string
  name?: string
  type: string
  description?: string | null
}

/** Forme minimale attendue en entrée du mapping. */
interface MappablePropertyDocument {
  url: string
  type: string
  id?: string
  name?: string
  description?: string | null
}

/**
 * Aplatit les documents d'étiquette énergie en URLs.
 * Calqué sur `extractEnergyDocumentUrls` côté admin.
 */
function extractEnergyLabelUrls(documents: MappablePropertyDocument[]) {
  const byType = new Map(documents.map((d) => [d.type, d.url]))
  return {
    dpeImageUrl: byType.get("DPE_IMAGE") ?? null,
    gesImageUrl: byType.get("GES_IMAGE") ?? null,
  }
}

/**
 * Projette un bien Prisma vers sa représentation publique.
 *
 * Trois responsabilités :
 * 1. retirer les données internes (`internalNotes`, `userId`, `user`) ;
 * 2. remonter les étiquettes énergie à plat dans `energy.dpeImageUrl` /
 *    `energy.gesImageUrl`, pour que la vitrine n'ait pas à fouiller les
 *    documents ;
 * 3. ne laisser dans `documents` que les vrais documents à télécharger
 *    (diagnostics, plans), sans leurs champs internes (`propertyId`, `size`,
 *    `mimeType`).
 */
export function mapPropertyForPublic<T extends Record<string, unknown>>(property: T): T {
  const mapped = { ...property } as Record<string, unknown>

  delete mapped.internalNotes
  delete mapped.userId
  delete mapped.user

  const hasDocuments = Array.isArray(mapped.documents)
  const documents = hasDocuments ? (mapped.documents as MappablePropertyDocument[]) : []

  if (hasDocuments) {
    // Les étiquettes sont des images de rendu, pas des pièces à télécharger.
    // On ne recopie que les champs publics : `propertyId`, `size` et
    // `mimeType` restaient exposés jusqu'ici.
    const publicDocuments: PublicDocument[] = documents
      .filter((d) => !(ENERGY_LABEL_DOCUMENT_TYPES as readonly string[]).includes(d.type))
      .map((d) => ({
        ...(d.id !== undefined ? { id: d.id } : {}),
        url: d.url,
        type: d.type,
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
      }))

    mapped.documents = publicDocuments
  }

  if (mapped.energy && typeof mapped.energy === "object") {
    mapped.energy = {
      ...(mapped.energy as object),
      ...extractEnergyLabelUrls(documents),
    }
  }

  return mapped as T
}

/** Projette un tableau de biens. */
export function mapPropertiesForPublic<T extends Record<string, unknown>>(properties: T[]): T[] {
  return properties.map((property) => mapPropertyForPublic(property))
}
