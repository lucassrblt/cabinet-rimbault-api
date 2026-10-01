import { resend } from "@/lib/resend"

/**
 * Envoie un e-mail de notification à l'agence pour un lead entrant.
 *
 * - Destinataire : `AGENCY_NOTIFICATION_EMAIL` si définie, sinon `AgencySettings.email`.
 * - `replyTo` : e-mail de l'expéditeur du lead, pour que l'agent réponde directement.
 * - Sans `RESEND_API_KEY`, l'envoi est ignoré (avertissement dans les logs).
 *
 * Lève une erreur si Resend refuse l'envoi : l'appelant (fire-and-forget) la logge.
 */
export async function sendAgencyNotification(params: {
  // Libellé utilisé dans les logs (ex. "contact", "evaluation")
  kind: string
  settingsEmail?: string | null
  replyTo: string
  subject: string
  html: string
}): Promise<void> {
  const { kind, settingsEmail, replyTo, subject, html } = params

  if (!process.env.RESEND_API_KEY) {
    console.warn(`[Email] RESEND_API_KEY absente — notification agence (${kind}) non envoyée`)
    return
  }

  const to = process.env.AGENCY_NOTIFICATION_EMAIL?.trim() || settingsEmail?.trim()
  if (!to) {
    console.error(
      `[Email] Notification agence (${kind}) non envoyée : ni AGENCY_NOTIFICATION_EMAIL ni AgencySettings.email ne sont renseignés`,
    )
    return
  }

  const { error } = await resend.emails.send({
    from: process.env.AGENCY_EMAIL_FROM || "noreply@cabinet-rimbault.fr",
    to,
    replyTo,
    subject,
    html,
  })

  // Resend ne lève pas d'exception sur un refus API : il renvoie `error`
  if (error) {
    throw new Error(`Resend a refusé l'envoi (${error.name}) : ${error.message}`)
  }
}
