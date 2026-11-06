/**
 * POST /api/public/evaluation : demande d'estimation envoyée par le tunnel de
 * la vitrine (doc 04 §3.4 et §3.7, brief §9 « API », A34).
 *
 * Ordre : validation (400), consentement (422 `RGPD_REQUIRED`), création en
 * base (prioritaire : si elle échoue, 500 et aucun e-mail), puis deux e-mails
 * attendus, accusé au demandeur et notification à l'agent. Un échec d'e-mail
 * est journalisé et ne fait jamais échouer la requête : la demande est déjà
 * visible dans l'admin.
 */

import type { Prisma, PropertyCondition } from "@prisma/client"
import { type AgencySettingsLike, agencyInfo, agentRecipient } from "@/lib/emails/agency"
import {
  type EvaluationForEmail,
  evaluationAgentNotificationEmail,
} from "@/lib/emails/evaluation-agent-notification"
import { evaluationConfirmationEmail } from "@/lib/emails/evaluation-confirmation"
import { text } from "@/lib/emails/format"
import { type DeliveryStatus, deliver, type EmailTransport } from "@/lib/emails/mailer"
import {
  devDetails,
  isPlainObject,
  loadAgencySettings,
  type PublicFormConfig,
  type PublicFormResult,
} from "./notify"

export const REQUIRED_EVALUATION_FIELDS = [
  "propertyType",
  "postalCode",
  "firstName",
  "lastName",
  "email",
] as const

export const PROPERTY_CONDITIONS: readonly PropertyCondition[] = [
  "NEUF",
  "TRES_BON_ETAT",
  "BON_ETAT",
  "A_RAFRAICHIR",
  "A_RENOVER",
  "A_RESTAURER",
]

/** Limite de la vitrine pour le prénom et le nom (doc 04 §3.3). */
export const MAX_NAME_LENGTH = 80

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SITUATIONS: Record<string, "ACHAT" | "VENTE" | "RENSEIGNEMENT"> = {
  achat: "ACHAT",
  vente: "VENTE",
  renseignement: "RENSEIGNEMENT",
}

export type EvaluationRecord = EvaluationForEmail

export interface EvaluationDeps {
  db: {
    evaluation: {
      create(args: { data: Prisma.EvaluationCreateInput }): Promise<EvaluationRecord>
    }
    agencySettings: {
      findUnique(args: { where: { id: string } }): Promise<AgencySettingsLike | null>
    }
  }
  transport: EmailTransport | null
  config: PublicFormConfig
}

export interface EvaluationNotifications {
  requester: DeliveryStatus
  agent: DeliveryStatus
}

function badRequest(error: string): PublicFormResult {
  return { status: 400, body: { success: false, error } }
}

/** Valide le corps et le projette vers les colonnes du modèle `Evaluation`. */
export function parseEvaluationBody(
  body: unknown,
): { ok: true; data: Prisma.EvaluationCreateInput } | { ok: false; result: PublicFormResult } {
  if (!isPlainObject(body)) return { ok: false, result: badRequest("Corps JSON invalide") }

  for (const field of REQUIRED_EVALUATION_FIELDS) {
    if (text(body[field]) === null) {
      return { ok: false, result: badRequest(`Le champ ${field} est requis`) }
    }
  }
  for (const field of ["firstName", "lastName"] as const) {
    if ((text(body[field]) as string).length > MAX_NAME_LENGTH) {
      return {
        ok: false,
        result: badRequest(`Le champ ${field} est limité à ${MAX_NAME_LENGTH} caractères`),
      }
    }
  }
  const postalCode = text(body.postalCode) as string
  if (!/^\d{5}$/.test(postalCode)) {
    return { ok: false, result: badRequest("Le code postal doit contenir 5 chiffres") }
  }
  const email = text(body.email) as string
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, result: badRequest("L'adresse email n'est pas valide") }
  }
  const condition = body.condition ?? null
  if (condition !== null && !PROPERTY_CONDITIONS.includes(condition as PropertyCondition)) {
    return { ok: false, result: badRequest("La valeur de `condition` est invalide") }
  }
  if (body.rgpd !== true) {
    return {
      ok: false,
      result: {
        status: 422,
        body: { success: false, error: "Consentement RGPD requis", code: "RGPD_REQUIRED" },
      },
    }
  }

  const situationKey = typeof body.situation === "string" ? body.situation.toLowerCase() : ""

  return {
    ok: true,
    data: {
      propertyType: text(body.propertyType) as string,
      postalCode,
      address: text(body.address),
      // Colonnes `String?` : « 5+ » et « 59.5 » sont conservés tels quels (A34).
      surface: text(body.surface),
      levels: text(body.levels),
      rooms: text(body.rooms),
      bedrooms: text(body.bedrooms),
      bathrooms: text(body.bathrooms),
      constructionYear: text(body.constructionYear),
      renovations: text(body.renovations),
      hasGarage: body.hasGarage === true || body.hasParking === true,
      hasPool: body.hasPool === true,
      hasGarden: body.hasGarden === true,
      hasBalcony: body.hasBalcony === true,
      hasTerrace: body.hasTerrace === true,
      situation: SITUATIONS[situationKey] ?? "RENSEIGNEMENT",
      firstName: text(body.firstName) as string,
      lastName: text(body.lastName) as string,
      email,
      phone: text(body.phone),
      condition: condition as PropertyCondition | null,
      timeframe: text(body.timeframe),
      intent: text(body.intent),
      message: text(body.message),
      rgpd: true,
      source: text(body.source),
      userAgent: text(body.userAgent),
      referer: text(body.referer),
      status: "NOUVELLE",
    },
  }
}

/** Envoie l'accusé et la notification ; ne lève jamais. */
export async function notifyEvaluation(
  evaluation: EvaluationRecord,
  deps: EvaluationDeps,
): Promise<EvaluationNotifications> {
  try {
    const settings = await loadAgencySettings(deps.db)
    const agency = agencyInfo(settings)
    const recipient = agentRecipient(settings, {
      AGENCY_NOTIFICATION_EMAIL: deps.config.notificationEmail,
    })

    const confirmation = evaluationConfirmationEmail(evaluation, agency)
    const requesterSend = deliver(
      deps.transport,
      {
        from: deps.config.from,
        to: evaluation.email,
        subject: confirmation.subject,
        html: confirmation.html,
        text: confirmation.text,
        ...(agency.email ? { replyTo: agency.email } : {}),
      },
      `accusé d'estimation au demandeur (évaluation ${evaluation.id})`,
    )

    let agentSend: Promise<DeliveryStatus>
    if (recipient === null) {
      console.error(
        `[Email][ALERTE] Notification d'estimation non envoyée (évaluation ${evaluation.id}) : ni AGENCY_NOTIFICATION_EMAIL ni agencySettings.email.`,
      )
      agentSend = Promise.resolve("failed")
    } else {
      const notification = evaluationAgentNotificationEmail(evaluation, {
        adminUrl: deps.config.adminUrl,
      })
      agentSend = deliver(
        deps.transport,
        {
          from: deps.config.from,
          to: recipient,
          replyTo: evaluation.email,
          subject: notification.subject,
          html: notification.html,
          text: notification.text,
        },
        `notification d'estimation à l'agent (évaluation ${evaluation.id})`,
        { alert: true },
      )
    }

    const [requester, agent] = await Promise.all([requesterSend, agentSend])
    return { requester, agent }
  } catch (error) {
    console.error(
      `[Email][ALERTE] Préparation des e-mails impossible (évaluation ${evaluation.id}) :`,
      error,
    )
    return { requester: "failed", agent: "failed" }
  }
}

export async function handleEvaluation(
  body: unknown,
  deps: EvaluationDeps,
): Promise<PublicFormResult> {
  const parsed = parseEvaluationBody(body)
  if (!parsed.ok) return parsed.result

  let evaluation: EvaluationRecord
  try {
    evaluation = await deps.db.evaluation.create({ data: parsed.data })
  } catch (error) {
    console.error("Error creating public evaluation:", error)
    return {
      status: 500,
      body: {
        success: false,
        error: "Erreur lors de la création de la demande d'estimation",
        details: devDetails(error),
      },
    }
  }

  await notifyEvaluation(evaluation, deps)

  return {
    status: 201,
    body: {
      success: true,
      message: "Votre demande d'estimation a été enregistrée avec succès",
      data: { id: evaluation.id, createdAt: evaluation.createdAt },
    },
  }
}
