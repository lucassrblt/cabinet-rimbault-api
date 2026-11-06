/**
 * Dépendances communes des formulaires publics (estimation, contact) :
 * base, transport e-mail, configuration. Injectées pour que les tests
 * utilisent une base et un transport Resend factices.
 */

import type { AgencySettingsLike } from "@/lib/emails/agency"
import { adminBaseUrl } from "@/lib/emails/agency"
import { DEFAULT_SENDER } from "@/lib/emails/mailer"

export interface PublicFormConfig {
  /** Expéditeur vérifié (`AGENCY_EMAIL_FROM`). */
  from: string
  /** `AGENCY_NOTIFICATION_EMAIL`, prioritaire sur `agencySettings.email`. */
  notificationEmail: string | undefined
  /** Racine de l'admin pour le lien « Ouvrir dans l'admin ». */
  adminUrl: string
}

export interface PublicFormResult {
  status: number
  body: Record<string, unknown>
}

export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
): PublicFormConfig {
  return {
    from: env.AGENCY_EMAIL_FROM?.trim() || DEFAULT_SENDER,
    notificationEmail: env.AGENCY_NOTIFICATION_EMAIL,
    adminUrl: adminBaseUrl(env),
  }
}

/** Réglages du cabinet ; un échec de lecture ne fait jamais échouer la requête. */
export async function loadAgencySettings(db: {
  agencySettings: {
    findUnique(args: { where: { id: string } }): Promise<AgencySettingsLike | null>
  }
}): Promise<AgencySettingsLike | null> {
  try {
    return await db.agencySettings.findUnique({ where: { id: "default" } })
  } catch (error) {
    console.error("[Email] Lecture de agencySettings impossible :", error)
    return null
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function devDetails(error: unknown): string | undefined {
  if (process.env.NODE_ENV !== "development") return undefined
  return error instanceof Error ? error.message : String(error)
}
