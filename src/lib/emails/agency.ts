/**
 * Informations du cabinet utilisées par les e-mails (table `AgencySettings`)
 * et destinataire des notifications.
 */

import { text } from "./format"

export interface AgencySettingsLike {
  name?: string | null
  address?: string | null
  postalCode?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
}

export interface AgencyInfo {
  name: string
  /** « 117 boulevard Voltaire, 92600 Asnières-sur-Seine », ou `null`. */
  address: string | null
  phone: string | null
  email: string | null
}

export const DEFAULT_AGENCY_NAME = "Cabinet Rimbault"

/** Back-office (lien « Ouvrir dans l'admin »). */
export const DEFAULT_ADMIN_URL = "https://admin.cabinet-rimbault.fr"

export function agencyInfo(settings: AgencySettingsLike | null | undefined): AgencyInfo {
  const street = text(settings?.address)
  // Espace insécable : « 92600 Asnières-sur-Seine » ne se coupe jamais.
  const locality = [text(settings?.postalCode), text(settings?.city)].filter(Boolean).join("\u00A0")
  const address = [street, locality || null].filter(Boolean).join(", ") || null
  return {
    name: text(settings?.name) ?? DEFAULT_AGENCY_NAME,
    address,
    phone: text(settings?.phone),
    email: text(settings?.email),
  }
}

type Env = Record<string, string | undefined>

/**
 * Destinataire de la notification : `AGENCY_NOTIFICATION_EMAIL`, à défaut
 * l'e-mail du cabinet saisi dans l'admin (`agencySettings.email`).
 */
export function agentRecipient(
  settings: AgencySettingsLike | null | undefined,
  env: Env = process.env,
): string | null {
  return text(env.AGENCY_NOTIFICATION_EMAIL) ?? text(settings?.email)
}

/** URL de l'admin sans barre finale. */
export function adminBaseUrl(env: Env = process.env): string {
  return (text(env.ADMIN_URL) ?? DEFAULT_ADMIN_URL).replace(/\/+$/, "")
}
