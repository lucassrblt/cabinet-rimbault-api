/**
 * POST /api/public/contact : message envoyé par le formulaire de contact de la
 * vitrine (page Contact ou fiche d'un bien). Même logique que l'estimation :
 * validation (400 avec `fields`), consentement (422 `RGPD_REQUIRED`), création
 * en base prioritaire, puis accusé au demandeur et notification à l'agent,
 * attendus et journalisés sans jamais faire échouer la requête.
 */

import { LeadFinancing, LeadProfile, LeadSubject, type Prisma } from "@prisma/client"
import { z } from "zod"
import { type AgencySettingsLike, agencyInfo, agentRecipient } from "@/lib/emails/agency"
import {
  contactAgentNotificationEmail,
  type LeadForEmail,
} from "@/lib/emails/contact-agent-notification"
import { contactConfirmationEmail } from "@/lib/emails/contact-confirmation"
import { type DeliveryStatus, deliver, type EmailTransport } from "@/lib/emails/mailer"
import {
  devDetails,
  loadAgencySettings,
  type PublicFormConfig,
  type PublicFormResult,
} from "./notify"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Body attendu — structure imbriquée conforme au contrat API §3.1
export const contactBodySchema = z.object({
  subject: z.nativeEnum(LeadSubject),
  propertyReference: z.string().min(1).optional(),
  profile: z.nativeEnum(LeadProfile).optional(),
  financing: z.nativeEnum(LeadFinancing).optional(),
  visitAvailability: z.array(z.string().min(1)).optional(),
  contact: z.object({
    firstName: z.string().min(1, "firstName est requis"),
    lastName: z.string().min(1, "lastName est requis"),
    email: z.string().regex(emailRegex, "L'adresse email n'est pas valide"),
    phone: z.string().optional(),
    message: z.string().min(1, "message est requis").max(500, "message limité à 500 caractères"),
  }),
  consent: z.object({
    rgpd: z.boolean(),
  }),
  meta: z
    .object({
      source: z.string().optional(),
      page: z.string().optional(),
      userAgent: z.string().optional(),
      referer: z.string().optional(),
    })
    .optional(),
})

export type LeadRecord = LeadForEmail

export interface ContactDeps {
  db: {
    lead: {
      create(args: { data: Prisma.LeadCreateInput }): Promise<LeadRecord>
    }
    agencySettings: {
      findUnique(args: { where: { id: string } }): Promise<AgencySettingsLike | null>
    }
  }
  transport: EmailTransport | null
  config: PublicFormConfig
}

export interface ContactNotifications {
  requester: DeliveryStatus
  agent: DeliveryStatus
}

/** Envoie l'accusé et la notification ; ne lève jamais. */
export async function notifyContact(
  lead: LeadRecord,
  deps: ContactDeps,
): Promise<ContactNotifications> {
  try {
    const settings = await loadAgencySettings(deps.db)
    const agency = agencyInfo(settings)
    const recipient = agentRecipient(settings, {
      AGENCY_NOTIFICATION_EMAIL: deps.config.notificationEmail,
    })

    const confirmation = contactConfirmationEmail(lead, agency)
    const requesterSend = deliver(
      deps.transport,
      {
        from: deps.config.from,
        to: lead.email,
        subject: confirmation.subject,
        html: confirmation.html,
        text: confirmation.text,
        ...(agency.email ? { replyTo: agency.email } : {}),
      },
      `accusé de contact au demandeur (lead ${lead.id})`,
    )

    let agentSend: Promise<DeliveryStatus>
    if (recipient === null) {
      console.error(
        `[Email][ALERTE] Notification de contact non envoyée (lead ${lead.id}) : ni AGENCY_NOTIFICATION_EMAIL ni agencySettings.email.`,
      )
      agentSend = Promise.resolve("failed")
    } else {
      const notification = contactAgentNotificationEmail(lead, { adminUrl: deps.config.adminUrl })
      agentSend = deliver(
        deps.transport,
        {
          from: deps.config.from,
          to: recipient,
          replyTo: lead.email,
          subject: notification.subject,
          html: notification.html,
          text: notification.text,
        },
        `notification de contact à l'agent (lead ${lead.id})`,
        { alert: true },
      )
    }

    const [requester, agent] = await Promise.all([requesterSend, agentSend])
    return { requester, agent }
  } catch (error) {
    console.error(`[Email][ALERTE] Préparation des e-mails impossible (lead ${lead.id}) :`, error)
    return { requester: "failed", agent: "failed" }
  }
}

export async function handleContact(body: unknown, deps: ContactDeps): Promise<PublicFormResult> {
  const parsed = contactBodySchema.safeParse(body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fields[issue.path.join(".")] = issue.message
    }
    const firstMessage = parsed.error.issues[0]?.message || "Validation échouée"
    return { status: 400, body: { success: false, error: firstMessage, fields } }
  }

  const data = parsed.data

  // Le consentement RGPD est bloquant sur le formulaire de contact (wireframes vitrine)
  if (data.consent.rgpd !== true) {
    return {
      status: 422,
      body: { success: false, error: "Consentement RGPD requis", code: "RGPD_REQUIRED" },
    }
  }

  let lead: LeadRecord
  try {
    lead = await deps.db.lead.create({
      data: {
        subject: data.subject,
        propertyReference: data.propertyReference ?? null,
        profile: data.profile ?? null,
        financing: data.financing ?? null,
        visitAvailability: data.visitAvailability ?? [],
        firstName: data.contact.firstName,
        lastName: data.contact.lastName,
        email: data.contact.email,
        phone: data.contact.phone ?? null,
        message: data.contact.message,
        rgpd: data.consent.rgpd,
        source: data.meta?.source ?? null,
        page: data.meta?.page ?? null,
        userAgent: data.meta?.userAgent ?? null,
        referer: data.meta?.referer ?? null,
      },
    })
  } catch (error) {
    console.error("Error creating public contact lead:", error)
    return {
      status: 500,
      body: {
        success: false,
        error: "Erreur lors de la création de la demande de contact",
        details: devDetails(error),
      },
    }
  }

  await notifyContact(lead, deps)

  return {
    status: 201,
    body: {
      success: true,
      message: "Votre demande a été enregistrée avec succès",
      data: { id: lead.id, createdAt: lead.createdAt },
    },
  }
}
