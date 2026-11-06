/**
 * Formatage commun aux e-mails (accusés au demandeur et notifications à l'agent).
 *
 * Règle : chaque fonction renvoie une chaîne lisible ou `null` (valeur absente).
 * Aucune ne renvoie jamais « NaN », « undefined » ou « null » en texte : les
 * gabarits n'écrivent une ligne que si la valeur est une chaîne non vide.
 */

const NBSP = "\u00A0"

const decimalFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

/** Chaîne nettoyée, ou `null` si vide, absente ou d'un autre type qu'une chaîne ou un nombre fini. */
export function text(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** « 59.5 » ou « 59,5 » → 59.5 ; `null` si illisible. */
export function parseDecimal(value: unknown): number | null {
  const raw = text(value)
  if (raw === null) return null
  const normalized = raw.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Nombre à la française : « 59,5 », « 1 200 ». */
export function formatDecimal(n: number): string {
  return decimalFormatter.format(n)
}

/** « 59.5 » → « 59,5 m² ». Valeur illisible : recopiée telle quelle (jamais « NaN »). */
export function formatSurface(value: unknown): string | null {
  const n = parseDecimal(value)
  if (n !== null) return `${formatDecimal(n)}${NBSP}m²`
  return text(value)
}

/**
 * Valeur de comptage « 3 » ou « 4+ » : `{ count: 3, orMore: false }`.
 * `null` si la valeur n'est pas de cette forme.
 */
function parseCount(value: unknown): { count: number; orMore: boolean } | null {
  const raw = text(value)
  if (raw === null) return null
  const match = /^(\d{1,3})\s*(\+)?$/.exec(raw)
  if (!match) return null
  return { count: Number(match[1]), orMore: match[2] === "+" }
}

/**
 * Comptage accordé : `formatCount("3", "pièce", "pièces")` → « 3 pièces » ;
 * « 1 » → « 1 pièce » ; « 0 » → « 0 pièce » ; « 5+ » → « 5 pièces ou plus ».
 * Valeur d'une autre forme : recopiée telle quelle.
 */
export function formatCount(value: unknown, singular: string, plural: string): string | null {
  const parsed = parseCount(value)
  if (parsed === null) return text(value)
  const { count, orMore } = parsed
  if (orMore) return `${count}${NBSP}${plural} ou plus`
  return `${count}${NBSP}${count <= 1 ? singular : plural}`
}

/** « 1 pièce », « 3 pièces », « 5 pièces ou plus » (A34). */
export function formatRooms(value: unknown): string | null {
  return formatCount(value, "pièce", "pièces")
}

/** Valeur nue d'un sélecteur : « 2 », « 4 ou plus ». */
export function formatPlainCount(value: unknown): string | null {
  const parsed = parseCount(value)
  if (parsed === null) return text(value)
  return parsed.orMore ? `${parsed.count} ou plus` : String(parsed.count)
}

// --- Libellés des listes fermées ------------------------------------------------

export const INTENT_LABELS: Record<string, string> = {
  ESTIMATION_VENTE: "Estimation du prix de vente",
  ESTIMATION_LOYER: "Estimation du loyer",
  // Valeurs de la vitrine précédente, encore en ligne entre le déploiement de
  // l'API et celui de la vitrine refondue (« EXPLORATION » → libellé par défaut).
  SELL: "Estimation du prix de vente",
  RENT_OUT: "Estimation du loyer",
}

/** Intention normalisée : `ESTIMATION_VENTE`, `ESTIMATION_LOYER` ou `null`. */
export function intentKey(intent: unknown): "ESTIMATION_VENTE" | "ESTIMATION_LOYER" | null {
  const key = text(intent)
  if (key === "ESTIMATION_VENTE" || key === "SELL") return "ESTIMATION_VENTE"
  if (key === "ESTIMATION_LOYER" || key === "RENT_OUT") return "ESTIMATION_LOYER"
  return null
}

/** Objet en clair de la demande d'estimation. Intention absente ou inconnue : « Demande d’estimation ». */
export function intentLabel(intent: unknown): string {
  const key = text(intent)
  return (key !== null && INTENT_LABELS[key]) || "Demande d’estimation"
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APPARTEMENT: "Appartement",
  MAISON: "Maison",
}

/** « APPARTEMENT » → « Appartement » ; une autre valeur est recopiée avec une majuscule initiale. */
export function propertyTypeLabel(value: unknown): string | null {
  const raw = text(value)
  if (raw === null) return null
  const known = PROPERTY_TYPE_LABELS[raw.toUpperCase()]
  if (known) return known
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export const CONDITION_LABELS: Record<string, string> = {
  NEUF: "Neuf ou récent",
  TRES_BON_ETAT: "Très bon état",
  BON_ETAT: "Bon état",
  A_RAFRAICHIR: "À rafraîchir",
  A_RENOVER: "À rénover",
  A_RESTAURER: "À restaurer",
}

export function conditionLabel(value: unknown): string | null {
  const raw = text(value)
  if (raw === null) return null
  return CONDITION_LABELS[raw] ?? raw
}

/** Objet d'un message de contact, tel que l'agent le lit. */
export const LEAD_SUBJECT_LABELS: Record<string, string> = {
  BIEN_SALE: "Demande au sujet d’un bien en vente",
  BIEN_RENT: "Demande au sujet d’un bien en location",
  ESTIMATION: "Demande d’estimation",
  APPOINTMENT: "Demande de rendez-vous",
  OTHER: "Message envoyé depuis le site",
}

export function leadSubjectLabel(value: unknown): string {
  const key = text(value)
  return (key !== null && LEAD_SUBJECT_LABELS[key]) || LEAD_SUBJECT_LABELS.OTHER
}

/** Libellés repris de l'admin (fiche d'un lead). */
export const LEAD_PROFILE_LABELS: Record<string, string> = {
  BUYER: "Acheteur",
  INVESTOR: "Investisseur",
  CURIOUS: "Curieux",
  TENANT: "Locataire",
}

export const LEAD_FINANCING_LABELS: Record<string, string> = {
  APPROVED: "Financement approuvé",
  IN_PROGRESS: "En cours d’obtention",
  TO_STUDY: "À étudier",
  CASH: "Comptant",
}

// --- Personnes, dates, liens ----------------------------------------------------

/**
 * Valeur sur une seule ligne : toute suite d'espaces, de tabulations ou de
 * retours à la ligne (U+2028 compris) devient une espace. Pour les objets d'e-mail et les noms
 * (un CR/LF saisi dans un prénom ne doit jamais passer dans un en-tête).
 */
export function oneLine(value: unknown): string | null {
  const raw = text(value)
  // `\s` sans les espaces insécables (U+00A0, U+202F) que l'on compose soi-même
  // (« 59,5 m² », « 5 pièces ») : elles ne coupent pas la ligne et doivent rester.
  return raw === null ? null : raw.replace(/[^\S\u00A0\u202F]+/g, " ")
}

/** Longueur maximale d'un objet d'e-mail. */
export const MAX_SUBJECT_LENGTH = 200

/** Objet sur une ligne, borné à 200 caractères (« … » final si coupé). */
export function boundSubject(subject: string): string {
  const line = oneLine(subject) ?? ""
  if (line.length <= MAX_SUBJECT_LENGTH) return line
  return `${line.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…`
}

/** Objet : parties non vides, chacune sur une ligne, jointes par « , » et bornées à 200 caractères. */
export function joinSubject(parts: unknown[]): string {
  return boundSubject(
    parts
      .map((p) => oneLine(p))
      .filter((p): p is string => p !== null)
      .join(", "),
  )
}

/** « Marie Durand » sur une ligne ; parties absentes ignorées. */
export function fullName(firstName: unknown, lastName: unknown): string {
  return [oneLine(firstName), oneLine(lastName)].filter((p): p is string => p !== null).join(" ")
}

const PARIS = "Europe/Paris"
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})
const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** « le 30/10/2026 à 14 h 12 » (heure de Paris). */
export function formatReceivedAt(date: Date): string {
  const [hours, minutes] = timeFormatter.format(date).split(":")
  return `le ${dateFormatter.format(date)} à ${hours}${NBSP}h${NBSP}${minutes}`
}

/** Lien `tel:` : chiffres et « + » seulement. `null` si le numéro est vide. */
export function telHref(phone: unknown): string | null {
  const raw = text(phone)
  if (raw === null) return null
  const digits = raw.replace(/[^\d+]/g, "")
  return digits === "" ? null : `tel:${digits}`
}

/** Échappement HTML de toute valeur saisie par un visiteur. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
