import type { Evaluation, Lead } from "@prisma/client"

/**
 * E-mails de notification envoyés à l'agence à chaque lead entrant
 * (formulaire de contact et demande d'estimation).
 *
 * Contrairement aux e-mails de confirmation, toutes les valeurs saisies par
 * l'internaute sont échappées : l'e-mail arrive dans la boîte de l'agent et
 * ne doit pas pouvoir y injecter de HTML (liens piégés, faux contenus…).
 */

// ─── Libellés FR des enums ─────────────────────────────────────────────────────

const LEAD_SUBJECT_LABELS: Record<string, string> = {
  BIEN_SALE: "Demande sur un bien à vendre",
  BIEN_RENT: "Demande sur un bien à louer",
  ESTIMATION: "Demande d'estimation",
  APPOINTMENT: "Demande de rendez-vous",
  OTHER: "Autre demande",
}

const LEAD_PROFILE_LABELS: Record<string, string> = {
  BUYER: "Acquéreur",
  INVESTOR: "Investisseur",
  CURIOUS: "Curieux",
  TENANT: "Locataire",
}

const LEAD_FINANCING_LABELS: Record<string, string> = {
  APPROVED: "Financement accordé",
  IN_PROGRESS: "Financement en cours",
  TO_STUDY: "Financement à étudier",
  CASH: "Achat comptant",
}

const PROPERTY_CONDITION_LABELS: Record<string, string> = {
  NEUF: "Neuf",
  TRES_BON_ETAT: "Très bon état",
  BON_ETAT: "Bon état",
  A_RAFRAICHIR: "À rafraîchir",
  A_RENOVER: "À rénover",
  A_RESTAURER: "À restaurer",
}

const EVALUATION_SITUATION_LABELS: Record<string, string> = {
  ACHAT: "Achat",
  VENTE: "Vente",
  RENSEIGNEMENT: "Simple renseignement",
}

// ─── Helpers de rendu ──────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function label(map: Record<string, string>, value: string | null | undefined): string | null {
  if (!value) return null
  return map[value] ?? value
}

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date)
}

/**
 * Construit l'URL de la fiche bien sur la vitrine à partir de
 * `PROPERTY_PAGE_URL_TEMPLATE` (ex. `https://cabinet-rimbault.fr/bien/{reference}`).
 * Retourne null si la variable n'est pas définie.
 */
export function buildPropertyPageUrl(reference: string): string | null {
  const template = process.env.PROPERTY_PAGE_URL_TEMPLATE?.trim()
  if (!template?.includes("{reference}")) return null
  return template.replace("{reference}", encodeURIComponent(reference))
}

// Une ligne « Libellé : valeur ». `html` = valeur déjà échappée / construite.
type Row = { label: string; html: string }

function textRow(rowLabel: string, value: string | number | null | undefined): Row | null {
  if (value == null || value === "") return null
  return { label: rowLabel, html: escapeHtml(String(value)) }
}

function renderRows(rows: Array<Row | null>): string {
  return rows
    .filter((row): row is Row => row !== null)
    .map(
      (row) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:14px;color:#6b7280;vertical-align:top;white-space:nowrap">${row.label}</td><td style="padding:4px 0;font-size:15px;line-height:1.5;color:#18181b">${row.html}</td></tr>`,
    )
    .join("\n")
}

function renderSection(title: string, content: string): string {
  if (!content) return ""
  return `
              <p style="margin:24px 0 8px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">${title}</p>
              ${content}`
}

function renderTable(rows: Array<Row | null>): string {
  const body = renderRows(rows)
  if (!body) return ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${body}</table>`
}

function renderMessage(message: string | null | undefined): string {
  if (!message) return ""
  return `<blockquote style="margin:0;padding:12px 16px;border-left:3px solid #1e3a5f;background-color:#f9fafb;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</blockquote>`
}

function contactRows(person: {
  firstName: string
  lastName: string
  email: string
  phone: string | null
}): Array<Row | null> {
  const email = escapeHtml(person.email)
  const rows: Array<Row | null> = [
    textRow("Nom", `${person.firstName} ${person.lastName}`),
    {
      label: "E-mail",
      html: `<a href="mailto:${email}" style="color:#1a56db">${email}</a>`,
    },
  ]
  if (person.phone) {
    const phone = escapeHtml(person.phone)
    const telHref = escapeHtml(person.phone.replace(/[^\d+]/g, ""))
    rows.push({
      label: "Téléphone",
      html: `<a href="tel:${telHref}" style="color:#1a56db">${phone}</a>`,
    })
  }
  return rows
}

function renderLayout(params: {
  title: string
  heading: string
  intro: string
  sections: string
  replyHint: string
  footer: string
}): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 32px">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${params.heading}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <p style="margin:0;font-size:15px;line-height:1.5;color:#374151">${params.intro}</p>
              ${params.sections}
              <p style="margin:32px 0 0;padding:12px 16px;background-color:#eff6ff;border-radius:6px;font-size:14px;line-height:1.5;color:#1e3a5f">${params.replyHint}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center">${params.footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Notification : formulaire de contact ──────────────────────────────────────

interface ContactNotificationProps {
  lead: Lead
  // Titre du bien si la référence correspond à un bien connu
  propertyTitle?: string | null
}

export function contactNotificationEmail(props: ContactNotificationProps): {
  subject: string
  html: string
} {
  const { lead, propertyTitle } = props
  const subjectLabel = label(LEAD_SUBJECT_LABELS, lead.subject) ?? "Demande de contact"
  const fullName = `${lead.firstName} ${lead.lastName}`

  const emailSubject = [
    "Nouveau contact",
    subjectLabel,
    lead.propertyReference ? `réf. ${lead.propertyReference}` : null,
    fullName,
  ]
    .filter(Boolean)
    .join(" — ")

  let propertyRow: Row | null = null
  if (lead.propertyReference) {
    const reference = escapeHtml(lead.propertyReference)
    const url = buildPropertyPageUrl(lead.propertyReference)
    const refHtml = url
      ? `<a href="${escapeHtml(url)}" style="color:#1a56db">${reference}</a>`
      : reference
    propertyRow = {
      label: "Bien",
      html: propertyTitle ? `${refHtml} — ${escapeHtml(propertyTitle)}` : refHtml,
    }
  }

  const requestTable = renderTable([
    { label: "Type", html: escapeHtml(subjectLabel) },
    propertyRow,
    textRow("Profil", label(LEAD_PROFILE_LABELS, lead.profile)),
    textRow("Financement", label(LEAD_FINANCING_LABELS, lead.financing)),
    textRow(
      "Disponibilités",
      lead.visitAvailability.length > 0 ? lead.visitAvailability.join(", ") : null,
    ),
  ])

  const contextTable = renderTable([
    textRow("Reçue le", formatDateFr(lead.createdAt)),
    textRow("Source", lead.source),
    textRow("Page", lead.page),
  ])

  const sections = [
    renderSection("Demande", requestTable),
    renderSection("Coordonnées", renderTable(contactRows(lead))),
    renderSection("Message", renderMessage(lead.message)),
    renderSection("Contexte", contextTable),
  ].join("")

  const html = renderLayout({
    title: escapeHtml(emailSubject),
    heading: "Nouvelle demande de contact",
    intro: `${escapeHtml(fullName)} vous a écrit depuis le site.`,
    sections,
    replyHint: `Répondez directement à cet e-mail pour écrire à ${escapeHtml(lead.firstName)} (${escapeHtml(lead.email)}).`,
    footer: `Lead ${escapeHtml(lead.id)} — à retrouver dans le back-office.`,
  })

  return { subject: emailSubject, html }
}

// ─── Notification : demande d'estimation ───────────────────────────────────────

interface EvaluationNotificationProps {
  evaluation: Evaluation
}

export function evaluationNotificationEmail(props: EvaluationNotificationProps): {
  subject: string
  html: string
} {
  const { evaluation: e } = props
  const fullName = `${e.firstName} ${e.lastName}`

  const emailSubject = `Nouvelle demande d'estimation — ${e.propertyType} ${e.postalCode} — ${fullName}`

  const equipments = [
    e.hasGarage && "Garage / parking",
    e.hasPool && "Piscine",
    e.hasGarden && "Jardin",
    e.hasBalcony && "Balcon",
    e.hasTerrace && "Terrasse",
  ].filter((item): item is string => Boolean(item))

  const propertyTable = renderTable([
    textRow("Type de bien", e.propertyType),
    textRow("Code postal", e.postalCode),
    textRow("Adresse", e.address),
    textRow("Surface", e.surface ? `${e.surface} m²` : null),
    textRow("Niveaux", e.levels),
    textRow("Pièces", e.rooms),
    textRow("Chambres", e.bedrooms),
    textRow("Salles de bains", e.bathrooms),
    textRow("Année de construction", e.constructionYear),
    textRow("État", label(PROPERTY_CONDITION_LABELS, e.condition)),
    textRow("Équipements", equipments.length > 0 ? equipments.join(", ") : null),
  ])

  const projectTable = renderTable([
    textRow("Situation", label(EVALUATION_SITUATION_LABELS, e.situation)),
    textRow("Intention", e.intent),
    textRow("Délai envisagé", e.timeframe),
  ])

  const contextTable = renderTable([
    textRow("Reçue le", formatDateFr(e.createdAt)),
    textRow("Source", e.source),
    textRow(
      "Consentement RGPD",
      e.rgpd === true ? "Oui" : e.rgpd === false ? "Non" : "Non renseigné",
    ),
  ])

  const sections = [
    renderSection("Le bien", propertyTable),
    e.renovations ? renderSection("Travaux réalisés", renderMessage(e.renovations)) : "",
    renderSection("Projet", projectTable),
    renderSection("Coordonnées", renderTable(contactRows(e))),
    renderSection("Message", renderMessage(e.message)),
    renderSection("Contexte", contextTable),
  ].join("")

  const html = renderLayout({
    title: escapeHtml(emailSubject),
    heading: "Nouvelle demande d'estimation",
    intro: `${escapeHtml(fullName)} souhaite faire estimer un bien.`,
    sections,
    replyHint: `Répondez directement à cet e-mail pour écrire à ${escapeHtml(e.firstName)} (${escapeHtml(e.email)}).`,
    footer: `Estimation ${escapeHtml(e.id)} — à retrouver dans le back-office.`,
  })

  return { subject: emailSubject, html }
}
