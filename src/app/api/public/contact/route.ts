import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { LeadSubject, LeadProfile, LeadFinancing } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import { resend } from "@/lib/resend"
import { contactConfirmationEmail } from "@/lib/emails/contact-confirmation"

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
  meta: z
    .object({
      source: z.string().optional(),
      page: z.string().optional(),
      userAgent: z.string().optional(),
      referer: z.string().optional(),
    })
    .optional(),
})

// POST /api/public/contact - Créer un nouveau lead (formulaire de contact vitrine)
// Protégé par X-API-Key
export async function POST(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    try {
      const body = await req.json()

      const parsed = contactBodySchema.safeParse(body)
      if (!parsed.success) {
        const fields: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          fields[issue.path.join(".")] = issue.message
        }
        const firstMessage = parsed.error.issues[0]?.message || "Validation échouée"
        return NextResponse.json(
          { success: false, error: firstMessage, fields },
          { status: 400 }
        )
      }

      const data = parsed.data

      // Le consentement RGPD est bloquant sur le formulaire de contact (wireframes vitrine)
      if (data.consent.rgpd !== true) {
        return NextResponse.json(
          { success: false, error: "Consentement RGPD requis", code: "RGPD_REQUIRED" },
          { status: 422 }
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

      // Fire-and-forget email
      prisma.agencySettings.findUnique({ where: { id: 'default' } })
        .then((settings) => {
          const email = contactConfirmationEmail({
            firstName: data.contact.firstName,
            lastName: data.contact.lastName,
            subject: data.subject,
            propertyReference: data.propertyReference,
            message: data.contact.message,
            agencyName: settings?.name || 'Cabinet Rimbault',
            agencyPhone: settings?.phone || undefined,
            agencyEmail: settings?.email || undefined,
          })
          return resend.emails.send({
            from: process.env.AGENCY_EMAIL_FROM || 'noreply@cabinet-rimbault.fr',
            to: data.contact.email,
            subject: email.subject,
            html: email.html,
          })
        })
        .catch((err) => console.error('[Email] Failed to send contact confirmation:', err))

      return NextResponse.json(
        {
          success: true,
          message: "Votre demande a été enregistrée avec succès",
          data: {
            id: lead.id,
            createdAt: lead.createdAt,
          },
        },
        { status: 201 }
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
        { status: 500 }
      )
    }
  })
}
