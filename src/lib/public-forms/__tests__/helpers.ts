/**
 * Base et transport Resend factices pour les tests des formulaires publics.
 * Aucun appel réseau, aucune base réelle.
 */

import { vi } from "vitest"
import type { AgencySettingsLike } from "@/lib/emails/agency"
import type { EmailMessage, EmailSendResult, EmailTransport } from "@/lib/emails/mailer"
import type { PublicFormConfig } from "../notify"

export const RECEIVED_AT = new Date("2026-10-30T13:12:00Z")

export const AGENCY: AgencySettingsLike = {
  name: "Cabinet Rimbault",
  address: "117 boulevard Voltaire",
  postalCode: "92600",
  city: "Asnières-sur-Seine",
  phone: "01 47 33 00 00",
  email: "cabinet@example.test",
}

export const CONFIG: PublicFormConfig = {
  from: "Cabinet Rimbault <noreply@example.test>",
  notificationEmail: "agent@example.test",
  adminUrl: "https://admin.example.test",
}

/** Transport Resend factice : enregistre chaque message, échoue à la demande. */
export function fakeTransport(
  behaviour: (message: EmailMessage) => EmailSendResult | Promise<EmailSendResult> = () => ({
    data: { id: "email_1" },
    error: null,
  }),
) {
  const sent: EmailMessage[] = []
  const transport: EmailTransport = {
    send: vi.fn(async (message: EmailMessage) => {
      sent.push(message)
      return behaviour(message)
    }),
  }
  return { transport, sent }
}

/** Le message adressé à l'agent (destinataire différent du demandeur). */
export function agentMessage(sent: EmailMessage[], requester: string): EmailMessage {
  const message = sent.find((m) => m.to !== requester)
  if (!message) throw new Error("Aucune notification à l'agent")
  return message
}

export function requesterMessage(sent: EmailMessage[], requester: string): EmailMessage {
  const message = sent.find((m) => m.to === requester)
  if (!message) throw new Error("Aucun accusé au demandeur")
  return message
}

/** Texte visible d'un HTML (balises et styles retirés, entités courantes décodées). */
export function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Aucun « NaN », « undefined », « null » ni nombre à point décimal (A34),
 * dans l'objet, la version texte et le texte visible du HTML.
 */
export function expectCleanEmail(message: EmailMessage, options: { allowDots?: RegExp } = {}) {
  const parts = [message.subject, message.text, visibleText(message.html)]
  for (const part of parts) {
    if (/\bNaN\b|\bundefined\b|\bnull\b/.test(part)) {
      throw new Error(`Valeur brute dans l'e-mail « ${message.subject} » :\n${part}`)
    }
    const withoutAllowed = options.allowDots ? part.replace(options.allowDots, "") : part
    if (/\d\.\d/.test(withoutAllowed)) {
      throw new Error(`Nombre à point décimal dans l'e-mail « ${message.subject} » :\n${part}`)
    }
  }
}

/** Espaces insécables (typographie française) ramenées à des espaces simples. */
export function plain(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, " ")
}
