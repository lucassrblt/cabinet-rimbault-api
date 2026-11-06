/**
 * Envoi des e-mails : transport injectable (Resend en production, transport
 * factice en test) et journalisation de chaque échec.
 */

import { resend } from "@/lib/resend"

export interface EmailMessage {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

/** Réponse de Resend : `{ data, error }`. Resend ne lève pas d'exception sur un refus. */
export interface EmailSendResult {
  data?: { id: string } | null
  error?: { message: string; name?: string } | null
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailSendResult>
}

export type DeliveryStatus = "sent" | "skipped" | "failed"

/** Transport Resend, ou `null` si `RESEND_API_KEY` est absente (aucun envoi). */
export function resendTransport(): EmailTransport | null {
  if (!process.env.RESEND_API_KEY) return null
  return {
    send: (message) => resend.emails.send(message) as Promise<EmailSendResult>,
  }
}

/** Expéditeur par défaut si `AGENCY_EMAIL_FROM` est absente (domaine vérifié dans Resend). */
export const DEFAULT_SENDER = "Cabinet Rimbault <noreply@cabinet-rimbault.fr>"

/** Préfixe des journaux à surveiller (alerte Railway) : notification à l'agent perdue. */
export const ALERT_PREFIX = "[Email][ALERTE]"

export interface DeliverOptions {
  /**
   * `true` pour la notification à l'agent : tout échec et tout envoi ignoré
   * s'écrivent en `console.error` préfixé exactement `[Email][ALERTE]`.
   */
  alert?: boolean
}

/**
 * Envoie un e-mail sans jamais lever : un échec (exception ou refus de Resend)
 * est journalisé avec `label` et renvoie `"failed"`.
 */
export async function deliver(
  transport: EmailTransport | null,
  message: EmailMessage,
  label: string,
  options: DeliverOptions = {},
): Promise<DeliveryStatus> {
  const prefix = options.alert ? ALERT_PREFIX : "[Email]"
  if (!transport) {
    const line = `${prefix} RESEND_API_KEY absente : envoi ignoré, ${label}.`
    if (options.alert) console.error(line)
    else console.warn(line)
    return "skipped"
  }
  try {
    const result = await transport.send(message)
    if (result?.error) {
      console.error(`${prefix} Échec : ${label}.`, result.error)
      return "failed"
    }
    return "sent"
  } catch (error) {
    console.error(`${prefix} Échec : ${label}.`, error)
    return "failed"
  }
}
