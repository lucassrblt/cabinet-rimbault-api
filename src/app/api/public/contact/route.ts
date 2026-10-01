import { LeadFinancing, LeadProfile, LeadSubject } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  createPublicPostRateLimiter,
  enforceRateLimit,
  honeypotSuccessResponse,
  isHoneypotFilled,
} from "@/lib/api-public-antispam"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import { contactConfirmationEmail } from "@/lib/emails/contact-confirmation"
import { contactNotificationEmail } from "@/lib/emails/lead-notification"
import { sendAgencyNotification } from "@/lib/emails/send-agency-notification"
import { prisma } from "@/lib/prisma"
import { resend } from "@/lib/resend"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Body attendu — structure imbriquée conforme au contrat API §3.1
const contactBodySchema = z.object({
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
  // Honeypot anti-spam (doit rester vide) — traité avant la validation
  website: z.string().optional(),
  meta: z
    .object({
      source: z.string().optional(),
      page: z.string().optional(),
      userAgent: z.string().optional(),
      referer: z.string().optional(),
    })
    .optional(),
})

const SUCCESS_MESSAGE = "Votre demande a été enregistrée avec succès"

// Rate limit propre à cet endpoint (5 requêtes / 10 min / IP)
const rateLimiter = createPublicPostRateLimiter()

// POST /api/public/contact - Créer un nouveau lead (formulaire de contact vitrine)
// Protégé par X-API-Key
export async function POST(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    const rateLimited = enforceRateLimit(rateLimiter, req)
    if (rateLimited) return rateLimited

    try {
      const body = await req.json()

      // Honeypot : un bot a rempli le champ caché → faux succès, rien n'est enregistré ni envoyé
      if (isHoneypotFilled(body)) {
        return honeypotSuccessResponse(SUCCESS_MESSAGE)
      }

      const parsed = contactBodySchema.safeParse(body)
      if (!parsed.success) {
        const fields: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          fields[issue.path.join(".")] = issue.message
        }
        const firstMessage = parsed.error.issues[0]?.message || "Validation échouée"
        return NextResponse.json({ success: false, error: firstMessage, fields }, { status: 400 })
      }

      const data = parsed.data

      // Le consentement RGPD est bloquant sur le formulaire de contact (wireframes vitrine)
      if (data.consent.rgpd !== true) {
        return NextResponse.json(
          { success: false, error: "Consentement RGPD requis", code: "RGPD_REQUIRED" },
          { status: 422 },
        )
      }

      const lead = await prisma.lead.create({
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

      // Fire-and-forget emails : confirmation à l'expéditeur + notification à l'agence
      const settingsPromise = prisma.agencySettings.findUnique({ where: { id: "default" } })

      settingsPromise
        .then((settings) => {
          const email = contactConfirmationEmail({
            firstName: data.contact.firstName,
            lastName: data.contact.lastName,
            subject: data.subject,
            propertyReference: data.propertyReference,
            message: data.contact.message,
            agencyName: settings?.name || "Cabinet Rimbault",
            agencyPhone: settings?.phone || undefined,
            agencyEmail: settings?.email || undefined,
          })
          return resend.emails.send({
            from: process.env.AGENCY_EMAIL_FROM || "noreply@cabinet-rimbault.fr",
            to: data.contact.email,
            subject: email.subject,
            html: email.html,
          })
        })
        .catch((err) => console.error("[Email] Failed to send contact confirmation:", err))

      settingsPromise
        .then(async (settings) => {
          // Titre du bien pour contextualiser la notification (best effort)
          const property = lead.propertyReference
            ? await prisma.property
                .findUnique({
                  where: { reference: lead.propertyReference },
                  select: { title: true },
                })
                .catch(() => null)
            : null
          const email = contactNotificationEmail({ lead, propertyTitle: property?.title })
          await sendAgencyNotification({
            kind: "contact",
            settingsEmail: settings?.email,
            replyTo: lead.email,
            subject: email.subject,
            html: email.html,
          })
        })
        .catch((err) =>
          console.error(`[Email] Échec de la notification agence (contact, lead ${lead.id}):`, err),
        )

      return NextResponse.json(
        {
          success: true,
          message: SUCCESS_MESSAGE,
          data: {
            id: lead.id,
            createdAt: lead.createdAt,
          },
        },
        { status: 201 },
      )
    } catch (error) {
      console.error("Error creating public contact lead:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de la création de la demande de contact",
          details:
            process.env.NODE_ENV === "development"
              ? error instanceof Error
                ? error.message
                : String(error)
              : undefined,
        },
        { status: 500 },
      )
    }
  })
}
