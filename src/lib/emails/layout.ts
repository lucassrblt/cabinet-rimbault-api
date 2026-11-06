/**
 * Briques HTML des e-mails, à l'identité de la vitrine (grenat et crème).
 *
 * Contraintes des clients mail : tableaux de mise en page, styles en ligne,
 * polices système (Georgia pour les titres, sans-serif système pour le texte),
 * aucune image, aucune ombre, aucun dégradé. Toute valeur saisie par un
 * visiteur passe par `escapeHtml` avant d'arriver ici, sauf mention `html`.
 */

import { escapeHtml } from "./format"

export const COLORS = {
  grenat: "#5F1A24",
  creme: "#F8F2E9",
  cremeSoutenu: "#EFE6D7",
  lait: "#FDFAF5",
  encre: "#251C19",
  encreDouce: "#574A43",
  gris: "#6F6259",
  filet: "#DED3C3",
} as const

const SERIF = "Georgia,'Times New Roman',Times,serif"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

/** E-mail prêt à l'envoi : objet, HTML et version texte. */
export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Ligne d'un tableau « libellé / valeur ». `value` est du texte brut (échappé ici). */
export interface Row {
  label: string
  value: string | null
  /** HTML déjà sûr (lien), prioritaire sur `value` dans la version HTML. */
  html?: string
}

function visible(rows: Row[]): Row[] {
  return rows.filter((r) => r.value !== null && r.value !== "")
}

/** Texte brut → HTML : échappé, retours à la ligne conservés. */
export function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />")
}

export function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${COLORS.grenat};text-decoration:underline">${escapeHtml(label)}</a>`
}

/** HTML sûr où « e-mail » ne se coupe jamais au trait d'union (fin de ligne à 320-390 px). */
export function keepEmailWord(html: string): string {
  return html.replace(/\be-mail\b/g, '<span style="white-space:nowrap">e-mail</span>')
}

export function heading1(content: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:normal;color:${COLORS.encre}">${escapeHtml(content)}</h1>`
}

export function paragraph(html: string, options: { muted?: boolean; size?: number } = {}): string {
  const color = options.muted ? COLORS.encreDouce : COLORS.encre
  const size = options.size ?? 16
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:${size}px;line-height:1.55;color:${color}">${html}</p>`
}

/** Section titrée (h2 en Georgia, filet au-dessus). */
export function section(title: string, inner: string): string {
  return `<tr>
  <td style="padding:28px 0 0">
    <h2 style="margin:0 0 4px;font-family:${SERIF};font-size:19px;line-height:1.3;font-weight:normal;color:${COLORS.encre}">${escapeHtml(title)}</h2>
    ${inner}
  </td>
</tr>`
}

/** Tableau « libellé / valeur ». Les lignes sans valeur sont omises. */
export function rowsTable(rows: Row[]): string {
  const body = visible(rows)
    .map(
      (r) => `<tr>
      <td valign="top" width="38%" style="padding:9px 16px 9px 0;border-bottom:1px solid ${COLORS.filet};font-family:${SANS};font-size:14px;line-height:1.45;color:${COLORS.gris}">${escapeHtml(r.label)}</td>
      <td valign="top" style="padding:9px 0;border-bottom:1px solid ${COLORS.filet};font-family:${SANS};font-size:15px;line-height:1.45;color:${COLORS.encre}">${r.html ?? multiline(r.value as string)}</td>
    </tr>`,
    )
    .join("\n    ")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid ${COLORS.filet}">
    ${body}
  </table>`
}

/** Bloc de texte libre (message du visiteur), sur crème soutenu, sans bordure ni rayon. */
export function quoteBlock(value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
    <tr>
      <td style="padding:16px 18px;background-color:${COLORS.cremeSoutenu};font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.encre}">${multiline(value)}</td>
    </tr>
  </table>`
}

/** Logotype composé en texte (pas d'image : bloquées par défaut dans beaucoup de clients). */
export function wordmark(agencyName: string, subtitle: string | null): string {
  const sub = subtitle
    ? `<br /><span style="font-family:${SANS};font-size:13px;line-height:1.4;color:${COLORS.gris}">${escapeHtml(subtitle)}</span>`
    : ""
  return `<span style="font-family:${SERIF};font-size:22px;line-height:1.2;color:${COLORS.grenat}">${escapeHtml(agencyName)}</span>${sub}`
}

/**
 * Document complet. `header` (facultatif) s'affiche au-dessus du contenu,
 * séparé par un filet ; `footer` en bas, en texte gris de 13 px.
 */
export function renderDocument(options: {
  title: string
  header?: string
  content: string
  footer: string
}): string {
  const header = options.header
    ? `<tr>
          <td style="padding:0 0 20px;border-bottom:1px solid ${COLORS.filet}">${options.header}</td>
        </tr>
        <tr><td style="height:28px;line-height:28px;font-size:0">&nbsp;</td></tr>`
    : ""
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.creme};color:${COLORS.encre}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.creme}">
    <tr>
      <td align="center" style="padding:36px 20px 40px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse">
        ${header}
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr><td>${options.content}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr>
                <td style="padding:16px 0 0;border-top:1px solid ${COLORS.filet};font-family:${SANS};font-size:13px;line-height:1.55;color:${COLORS.gris}">${options.footer}</td>
              </tr>
            </table>
          </td>
        </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Corps principal : suite de lignes de tableau (`section`) précédées d'un chapeau. */
export function contentTable(intro: string, sections: string[]): string {
  return `${intro}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
${sections.join("\n")}
</table>`
}

// --- Version texte ----------------------------------------------------------------

/** « Libellé : valeur » (espace insécable avant les deux-points). Lignes vides omises. */
export function textRows(rows: Row[]): string {
  return visible(rows)
    .map((r) => `${r.label}\u00A0: ${r.value}`)
    .join("\n")
}

export function textSection(title: string, body: string): string {
  return `${title}\n${"-".repeat(title.length)}\n${body}`
}
