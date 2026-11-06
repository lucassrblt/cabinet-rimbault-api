/**
 * Notification à l'agent : nouvelle demande d'estimation reçue par le tunnel
 * de la vitrine (doc 04 §3.7, brief A34).
 *
 * La première ligne (titre et première ligne du texte) dit l'objet en clair,
 * « Estimation du prix de vente » ou « Estimation du loyer » : l'admin
 * n'affiche pas `intent`, l'e-mail est le seul endroit où l'agent le lit.
 */

import { adminBaseUrl } from "./agency"
import {
  conditionLabel,
  escapeHtml,
  formatPlainCount,
  formatReceivedAt,
  formatRooms,
  formatSurface,
  fullName,
  intentLabel,
  joinSubject,
  propertyTypeLabel,
  telHref,
  text,
} from "./format"
import {
  contentTable,
  heading1,
  link,
  paragraph,
  quoteBlock,
  type RenderedEmail,
  type Row,
  renderDocument,
  rowsTable,
  section,
  textRows,
  textSection,
} from "./layout"

/** Demande telle qu'enregistrée en base (sous-ensemble du modèle `Evaluation`). */
export interface EvaluationForEmail {
  id: string
  createdAt: Date
  intent?: string | null
  propertyType: string
  postalCode: string
  address?: string | null
  surface?: string | null
  rooms?: string | null
  bedrooms?: string | null
  bathrooms?: string | null
  levels?: string | null
  constructionYear?: string | null
  renovations?: string | null
  condition?: string | null
  timeframe?: string | null
  hasBalcony?: boolean
  hasTerrace?: boolean
  hasGarden?: boolean
  hasGarage?: boolean
  hasPool?: boolean
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  message?: string | null
  rgpd?: boolean | null
  referer?: string | null
}

/** Champ facultatif laissé vide : valeur neutre et invariable (aucun accord). */
const NOT_GIVEN = "Pas de réponse"

function exteriors(e: EvaluationForEmail): string {
  const items = [
    e.hasBalcony && "balcon",
    e.hasTerrace && "terrasse",
    e.hasGarden && "jardin",
    e.hasGarage && "garage ou parking",
    e.hasPool && "piscine",
  ].filter((v): v is string => typeof v === "string")
  if (items.length === 0) return "Aucun"
  const list = items.join(", ")
  // Seul le premier élément prend la majuscule : « Balcon, garage ou parking ».
  return list.charAt(0).toUpperCase() + list.slice(1)
}

/**
 * Préférence de recontact saisie dans le tunnel : la vitrine l'écrit dans
 * `message` (ligne « Recontact : par téléphone, en fin de journée », doc 04
 * §3.4). Le message reste affiché tel quel plus bas.
 */
export function contactPreference(message: unknown): string | null {
  const raw = text(message)
  if (raw === null) return null
  const match = /^\s*Recontact\s*:\s*(.+?)\s*$/im.exec(raw)
  if (!match) return null
  const value = match[1]
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Objet : « Estimation du prix de vente, appartement de 59,5 m², 3 pièces, 92600, Marie Durand ». */
export function evaluationAgentSubject(e: EvaluationForEmail): string {
  const type = propertyTypeLabel(e.propertyType)
  const surface = formatSurface(e.surface)
  const property = type ? `${type.toLowerCase()}${surface ? ` de ${surface}` : ""}` : surface
  return joinSubject([
    intentLabel(e.intent),
    property,
    formatRooms(e.rooms),
    text(e.postalCode),
    fullName(e.firstName, e.lastName),
  ])
}

export function evaluationAgentNotificationEmail(
  e: EvaluationForEmail,
  options: { adminUrl?: string } = {},
): RenderedEmail {
  const title = intentLabel(e.intent)
  const name = fullName(e.firstName, e.lastName)
  const receivedAt = formatReceivedAt(e.createdAt)
  const phone = text(e.phone)
  const phoneHref = telHref(phone)
  const email = text(e.email)
  const message = text(e.message)
  const adminLink = `${options.adminUrl ?? adminBaseUrl()}/estimations/${encodeURIComponent(e.id)}`
  const isHouse = text(e.propertyType)?.toUpperCase() === "MAISON"

  const contactRows: Row[] = [
    { label: "Nom", value: name || NOT_GIVEN },
    {
      label: "Téléphone",
      value: phone ?? NOT_GIVEN,
      html: phone && phoneHref ? link(phoneHref, phone) : undefined,
    },
    {
      label: "E-mail",
      value: email ?? NOT_GIVEN,
      html: email ? link(`mailto:${email}`, email) : undefined,
    },
    { label: "Préférence de recontact", value: contactPreference(message) },
  ]

  const propertyRows: Row[] = [
    { label: "Objet", value: title },
    // Échéance du projet de vente, libellé lisible envoyé par la vitrine.
    { label: "Échéance du projet", value: text(e.timeframe) ?? NOT_GIVEN },
    { label: "Type de bien", value: propertyTypeLabel(e.propertyType) ?? NOT_GIVEN },
    { label: "Adresse", value: text(e.address) ?? NOT_GIVEN },
    { label: "Code postal", value: text(e.postalCode) ?? NOT_GIVEN },
    { label: "Surface habitable", value: formatSurface(e.surface) ?? NOT_GIVEN },
    { label: "Pièces", value: formatRooms(e.rooms) ?? NOT_GIVEN },
    { label: "Chambres", value: formatPlainCount(e.bedrooms) ?? NOT_GIVEN },
    { label: "Salles de bains ou d’eau", value: formatPlainCount(e.bathrooms) ?? NOT_GIVEN },
    {
      label: "Niveaux",
      value: formatPlainCount(e.levels) ?? (isHouse ? NOT_GIVEN : null),
    },
    { label: "Extérieurs et annexes", value: exteriors(e) },
    { label: "État général", value: conditionLabel(e.condition) ?? NOT_GIVEN },
    { label: "Époque de construction", value: text(e.constructionYear) ?? NOT_GIVEN },
    { label: "Travaux récents", value: text(e.renovations) ?? NOT_GIVEN },
  ]

  const followRows: Row[] = [
    {
      label: "Consentement RGPD",
      value: e.rgpd === true ? `Oui, donné ${receivedAt}` : "Non",
    },
    { label: "Page d’entrée", value: text(e.referer) },
    {
      label: "Admin",
      value: adminLink,
      html: link(adminLink, "Ouvrir la demande dans l’admin"),
    },
  ]

  const replyLine = name
    ? `Pour écrire à ${name}, répondez simplement à cet e-mail.`
    : "Pour écrire au demandeur, répondez simplement à cet e-mail."

  const intro = [
    heading1(title),
    paragraph(escapeHtml(`Nouvelle demande reçue ${receivedAt} sur le site du cabinet.`)),
    paragraph(escapeHtml(replyLine), { muted: true, size: 15 }),
  ].join("\n")

  const html = renderDocument({
    title,
    content: contentTable(intro, [
      section("Coordonnées", rowsTable(contactRows)),
      section("Le bien", rowsTable(propertyRows)),
      section(
        "Précisions et message",
        message
          ? quoteBlock(message)
          : paragraph("Aucune précision ni message.", { muted: true, size: 15 }),
      ),
      section("Suivi", rowsTable(followRows)),
    ]),
    footer:
      "Notification automatique envoyée par le site du Cabinet Rimbault à chaque demande d’estimation. La demande est aussi enregistrée dans l’admin.",
  })

  const textBody = [
    title,
    `Nouvelle demande reçue ${receivedAt} sur le site du cabinet.`,
    replyLine,
    "",
    textSection("Coordonnées", textRows(contactRows)),
    "",
    textSection("Le bien", textRows(propertyRows)),
    "",
    textSection("Précisions et message", message ?? "Aucune précision ni message."),
    "",
    textSection("Suivi", textRows(followRows)),
  ].join("\n")

  return { subject: evaluationAgentSubject(e), html, text: textBody }
}
