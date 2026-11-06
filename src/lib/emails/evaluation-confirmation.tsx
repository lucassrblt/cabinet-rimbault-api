/**
 * Accusé de réception envoyé au demandeur d'une estimation.
 * Aucun délai ni engagement non validé par le cabinet (brief §6.2, §10).
 */

import type { AgencyInfo } from "./agency"
import type { EvaluationForEmail } from "./evaluation-agent-notification"
import {
  escapeHtml,
  formatRooms,
  formatSurface,
  intentKey,
  intentLabel,
  oneLine,
  propertyTypeLabel,
  telHref,
  text,
} from "./format"
import {
  contentTable,
  heading1,
  keepEmailWord,
  link,
  paragraph,
  type RenderedEmail,
  type Row,
  renderDocument,
  rowsTable,
  section,
  textRows,
  textSection,
  wordmark,
} from "./layout"

const INTENT_PHRASES: Record<string, string> = {
  ESTIMATION_VENTE: "votre demande d’estimation du prix de vente",
  ESTIMATION_LOYER: "votre demande d’estimation du loyer",
}

export function evaluationConfirmationEmail(
  e: EvaluationForEmail,
  agency: AgencyInfo,
): RenderedEmail {
  const subject = "Votre demande d’estimation est bien arrivée"
  const firstName = oneLine(e.firstName)
  const intent = intentKey(e.intent)
  const what = (intent && INTENT_PHRASES[intent]) || "votre demande d’estimation"
  const thanks = firstName ? `Merci, ${firstName}.` : "Merci."
  const received = `${thanks} Nous avons bien reçu ${what}.`
  const next = "Nous vous recontactons pour convenir d’une visite du bien."

  const rows: Row[] = [
    { label: "Objet", value: intentLabel(e.intent) },
    { label: "Type de bien", value: propertyTypeLabel(e.propertyType) },
    { label: "Adresse", value: text(e.address) },
    { label: "Code postal", value: text(e.postalCode) },
    { label: "Surface habitable", value: formatSurface(e.surface) },
    { label: "Pièces", value: formatRooms(e.rooms) },
  ]

  const phoneHref = telHref(agency.phone)
  const questionHtml =
    agency.phone && phoneHref
      ? `Une question d’ici là ? Appelez-nous au ${link(phoneHref, agency.phone)}${agency.email ? " ou répondez à cet e-mail" : ""}.`
      : agency.email
        ? "Une question d’ici là ? Répondez simplement à cet e-mail."
        : null
  const questionText =
    agency.phone && phoneHref
      ? `Une question d’ici là ? Appelez-nous au ${agency.phone}${agency.email ? " ou répondez à cet e-mail" : ""}.`
      : agency.email
        ? "Une question d’ici là ? Répondez simplement à cet e-mail."
        : null

  const rights = `Vos informations servent uniquement à vous recontacter au sujet de cette demande. Vous pouvez en demander la rectification ou la suppression à tout moment${agency.email ? ` en écrivant à ${agency.email}` : ""}.`

  const html = renderDocument({
    title: subject,
    header: wordmark(agency.name, null),
    content: contentTable(
      [heading1("Votre demande est bien arrivée."), paragraph(escapeHtml(received))].join("\n"),
      [
        section("Votre demande", rowsTable(rows)),
        section(
          "La suite",
          [
            paragraph(escapeHtml(next)),
            questionHtml ? paragraph(keepEmailWord(questionHtml)) : "",
            paragraph(escapeHtml(agency.name)),
          ].join("\n"),
        ),
      ],
    ),
    footer: [
      escapeHtml(rights),
      agency.address ? escapeHtml(`${agency.name}, ${agency.address}`) : "",
    ]
      .filter(Boolean)
      .join("<br /><br />"),
  })

  const textBody = [
    "Votre demande est bien arrivée.",
    received,
    "",
    textSection("Votre demande", textRows(rows)),
    "",
    textSection("La suite", [next, questionText, agency.name].filter(Boolean).join("\n")),
    "",
    "-- ",
    rights,
    agency.address ? `${agency.name}, ${agency.address}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n")

  return { subject, html, text: textBody }
}
