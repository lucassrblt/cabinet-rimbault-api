/**
 * Notification à l'agent : nouveau message envoyé par le formulaire de contact
 * de la vitrine (page Contact ou fiche d'un bien). Même gabarit que la
 * notification d'estimation ; la première ligne dit l'objet en clair.
 */

import { adminBaseUrl } from "./agency"
import {
  escapeHtml,
  formatReceivedAt,
  fullName,
  joinSubject,
  LEAD_FINANCING_LABELS,
  LEAD_PROFILE_LABELS,
  leadSubjectLabel,
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

/** Message tel qu'enregistré en base (sous-ensemble du modèle `Lead`). */
export interface LeadForEmail {
  id: string
  createdAt: Date
  subject: string
  propertyReference?: string | null
  profile?: string | null
  financing?: string | null
  visitAvailability?: string[] | null
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  message: string
  rgpd?: boolean | null
  page?: string | null
  referer?: string | null
}

/** Champ facultatif laissé vide : valeur neutre et invariable (aucun accord). */
const NOT_GIVEN = "Pas de réponse"

function label(map: Record<string, string>, value: unknown): string | null {
  const key = text(value)
  return key === null ? null : (map[key] ?? key)
}

/** Objet : « Demande au sujet d’un bien en vente, réf. 10.131, Marie Durand ». */
export function contactAgentSubject(lead: LeadForEmail): string {
  const reference = text(lead.propertyReference)
  return joinSubject([
    leadSubjectLabel(lead.subject),
    reference ? `réf. ${reference}` : null,
    fullName(lead.firstName, lead.lastName),
  ])
}

export function contactAgentNotificationEmail(
  lead: LeadForEmail,
  options: { adminUrl?: string } = {},
): RenderedEmail {
  const title = leadSubjectLabel(lead.subject)
  const name = fullName(lead.firstName, lead.lastName)
  const receivedAt = formatReceivedAt(lead.createdAt)
  const phone = text(lead.phone)
  const phoneHref = telHref(phone)
  const email = text(lead.email)
  const message = text(lead.message)
  const page = text(lead.page)
  const referer = text(lead.referer)
  const availability = (lead.visitAvailability ?? [])
    .map((v) => text(v))
    .filter((v): v is string => v !== null)
  const adminLink = `${options.adminUrl ?? adminBaseUrl()}/leads/${encodeURIComponent(lead.id)}`

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
  ]

  const requestRows: Row[] = [
    { label: "Objet", value: title },
    { label: "Référence du bien", value: text(lead.propertyReference) },
    { label: "Profil", value: label(LEAD_PROFILE_LABELS, lead.profile) },
    { label: "Financement", value: label(LEAD_FINANCING_LABELS, lead.financing) },
    {
      label: "Disponibilités pour une visite",
      value: availability.length > 0 ? availability.join(", ") : null,
    },
  ]

  const followRows: Row[] = [
    {
      label: "Consentement RGPD",
      value: lead.rgpd === true ? `Oui, donné ${receivedAt}` : "Non",
    },
    { label: "Page du formulaire", value: page },
    { label: "Page d’entrée", value: referer && referer !== page ? referer : null },
    {
      label: "Admin",
      value: adminLink,
      html: link(adminLink, "Ouvrir le message dans l’admin"),
    },
  ]

  const replyLine = name
    ? `Pour écrire à ${name}, répondez simplement à cet e-mail.`
    : "Pour écrire à l’expéditeur, répondez simplement à cet e-mail."

  const intro = [
    heading1(title),
    paragraph(escapeHtml(`Nouveau message reçu ${receivedAt} sur le site du cabinet.`)),
    paragraph(escapeHtml(replyLine), { muted: true, size: 15 }),
  ].join("\n")

  const html = renderDocument({
    title,
    content: contentTable(intro, [
      section("Coordonnées", rowsTable(contactRows)),
      section("La demande", rowsTable(requestRows)),
      section("Message", message ? quoteBlock(message) : paragraph("Aucun message.")),
      section("Suivi", rowsTable(followRows)),
    ]),
    footer:
      "Notification automatique envoyée par le site du Cabinet Rimbault à chaque message reçu. Le message est aussi enregistré dans l’admin.",
  })

  const textBody = [
    title,
    `Nouveau message reçu ${receivedAt} sur le site du cabinet.`,
    replyLine,
    "",
    textSection("Coordonnées", textRows(contactRows)),
    "",
    textSection("La demande", textRows(requestRows)),
    "",
    textSection("Message", message ?? "Aucun message."),
    "",
    textSection("Suivi", textRows(followRows)),
  ].join("\n")

  return { subject: contactAgentSubject(lead), html, text: textBody }
}
