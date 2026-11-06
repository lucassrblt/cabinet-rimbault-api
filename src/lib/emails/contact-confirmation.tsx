/**
 * Accusé de réception envoyé à la personne qui a écrit par le formulaire de
 * contact. Aucun délai ni engagement non validé par le cabinet.
 */

import type { AgencyInfo } from "./agency"
import type { LeadForEmail } from "./contact-agent-notification"
import { boundSubject, escapeHtml, oneLine, telHref, text } from "./format"
import {
  contentTable,
  heading1,
  keepEmailWord,
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
  wordmark,
} from "./layout"

/** Objet du message, tel que le visiteur l'a choisi. */
const SUBJECT_LABELS: Record<string, string> = {
  BIEN_SALE: "Un bien en vente",
  BIEN_RENT: "Un bien en location",
  ESTIMATION: "Une estimation",
  APPOINTMENT: "Un rendez-vous",
  OTHER: "Une question",
}

export function contactConfirmationEmail(lead: LeadForEmail, agency: AgencyInfo): RenderedEmail {
  const reference = oneLine(lead.propertyReference)
  const subject = boundSubject(
    reference
      ? `Votre message au sujet du bien ${reference} est bien arrivé`
      : "Votre message est bien arrivé",
  )
  const firstName = oneLine(lead.firstName)
  const thanks = firstName ? `Merci, ${firstName}.` : "Merci."
  const received = `${thanks} Nous avons bien reçu votre message${reference ? ` au sujet du bien ${reference}` : ""} et nous vous répondrons personnellement.`
  const message = text(lead.message)

  const rows: Row[] = [
    { label: "Objet", value: SUBJECT_LABELS[lead.subject] ?? SUBJECT_LABELS.OTHER },
    { label: "Référence du bien", value: reference },
  ]

  // « Nous joindre » : téléphone et, si le cabinet a une adresse e-mail (`replyTo`
  // de l'accusé), invitation à répondre. Ni l'un ni l'autre : pas de section.
  const phoneHref = telHref(agency.phone)
  const replyHint = agency.email ? " ou répondez à cet e-mail" : ""
  const reachHtml =
    agency.phone && phoneHref
      ? `Pour nous joindre directement : ${link(phoneHref, agency.phone)}${replyHint}.`
      : agency.email
        ? "Pour nous écrire, répondez simplement à cet e-mail."
        : null
  const reachText =
    agency.phone && phoneHref
      ? `Pour nous joindre directement : ${agency.phone}${replyHint}.`
      : agency.email
        ? "Pour nous écrire, répondez simplement à cet e-mail."
        : null

  const rights = `Vos informations servent uniquement à vous répondre. Vous pouvez en demander la rectification ou la suppression à tout moment${agency.email ? ` en écrivant à ${agency.email}` : ""}.`

  const html = renderDocument({
    title: subject,
    header: wordmark(agency.name, null),
    content: contentTable(
      [heading1("Votre message est bien arrivé."), paragraph(escapeHtml(received))].join("\n"),
      [
        section(
          "Votre message",
          [
            rowsTable(rows),
            message
              ? `<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>${quoteBlock(message)}`
              : "",
          ].join("\n"),
        ),
        reachHtml
          ? section(
              "Nous joindre",
              [paragraph(keepEmailWord(reachHtml)), paragraph(escapeHtml(agency.name))].join("\n"),
            )
          : "",
      ].filter(Boolean),
    ),
    footer: [
      escapeHtml(rights),
      agency.address ? escapeHtml(`${agency.name}, ${agency.address}`) : "",
    ]
      .filter(Boolean)
      .join("<br /><br />"),
  })

  const textBody = [
    "Votre message est bien arrivé.",
    received,
    "",
    textSection("Votre message", [textRows(rows), "", message ?? ""].join("\n")),
    "",
    ...(reachText ? [textSection("Nous joindre", `${reachText}\n${agency.name}`), ""] : []),
    "-- ",
    rights,
    agency.address ? `${agency.name}, ${agency.address}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n")

  return { subject, html, text: textBody }
}
