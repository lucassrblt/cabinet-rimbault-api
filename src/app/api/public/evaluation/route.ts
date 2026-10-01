import { PropertyCondition } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"
import {
  createPublicPostRateLimiter,
  enforceRateLimit,
  honeypotSuccessResponse,
  isHoneypotFilled,
} from "@/lib/api-public-antispam"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import { evaluationConfirmationEmail } from "@/lib/emails/evaluation-confirmation"
import { evaluationNotificationEmail } from "@/lib/emails/lead-notification"
import { sendAgencyNotification } from "@/lib/emails/send-agency-notification"
import { prisma } from "@/lib/prisma"
import { resend } from "@/lib/resend"

const PROPERTY_CONDITION_VALUES = Object.values(PropertyCondition) as string[]

const SUCCESS_MESSAGE = "Votre demande d'estimation a été enregistrée avec succès"

// Rate limit propre à cet endpoint (5 requêtes / 10 min / IP)
const rateLimiter = createPublicPostRateLimiter()

// POST /api/public/evaluation - Créer une nouvelle demande d'estimation
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

      // Validation des champs requis
      const requiredFields = ["propertyType", "postalCode", "firstName", "lastName", "email"]
      for (const field of requiredFields) {
        if (!body[field]) {
          return NextResponse.json(
            { success: false, error: `Le champ ${field} est requis` },
            { status: 400 },
          )
        }
      }

      // Validation du code postal (5 chiffres)
      if (!/^\d{5}$/.test(body.postalCode)) {
        return NextResponse.json(
          { success: false, error: "Le code postal doit contenir 5 chiffres" },
          { status: 400 },
        )
      }

      // Validation de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(body.email)) {
        return NextResponse.json(
          { success: false, error: "L'adresse email n'est pas valide" },
          { status: 400 },
        )
      }

      // Validation du champ `condition` (enum PropertyCondition, optionnel)
      if (body.condition != null && !PROPERTY_CONDITION_VALUES.includes(body.condition)) {
        return NextResponse.json(
          { success: false, error: "La valeur de `condition` est invalide" },
          { status: 400 },
        )
      }

      // Mapper la situation
      let situation: "ACHAT" | "VENTE" | "RENSEIGNEMENT" = "RENSEIGNEMENT"
      if (body.situation) {
        const situationMap: Record<string, "ACHAT" | "VENTE" | "RENSEIGNEMENT"> = {
          achat: "ACHAT",
          vente: "VENTE",
          renseignement: "RENSEIGNEMENT",
        }
        situation = situationMap[body.situation.toLowerCase()] || "RENSEIGNEMENT"
      }

      const evaluation = await prisma.evaluation.create({
        data: {
          propertyType: body.propertyType,
          postalCode: body.postalCode,
          address: body.address || null,
          surface: body.surface || null,
          levels: body.levels || null,
          rooms: body.rooms || null,
          bedrooms: body.bedrooms || null,
          bathrooms: body.bathrooms || null,
          constructionYear: body.constructionYear || null,
          renovations: body.renovations || null,
          hasGarage: body.hasGarage === true || body.hasParking === true,
          hasPool: body.hasPool === true,
          hasGarden: body.hasGarden === true,
          hasBalcony: body.hasBalcony === true,
          hasTerrace: body.hasTerrace === true,
          situation,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone || null,
          // Phase C — champs additifs optionnels (contrat API §5.3)
          condition: body.condition ?? null,
          timeframe: body.timeframe ?? null,
          intent: body.intent ?? null,
          message: body.message ?? null,
          rgpd: typeof body.rgpd === "boolean" ? body.rgpd : null,
          source: body.source ?? null,
          userAgent: body.userAgent ?? null,
          referer: body.referer ?? null,
          status: "NOUVELLE",
        },
      })

      // Fire-and-forget emails : confirmation au demandeur + notification à l'agence
      const settingsPromise = prisma.agencySettings.findUnique({ where: { id: "default" } })

      settingsPromise
        .then((settings) => {
          const email = evaluationConfirmationEmail({
            firstName: body.firstName,
            lastName: body.lastName,
            propertyType: body.propertyType,
            postalCode: body.postalCode,
            surface: body.surface ? Number(body.surface) : undefined,
            rooms: body.rooms ? Number(body.rooms) : undefined,
            agencyName: settings?.name || "Cabinet Rimbault",
            agencyPhone: settings?.phone || undefined,
            agencyEmail: settings?.email || undefined,
          })
          return resend.emails.send({
            from: process.env.AGENCY_EMAIL_FROM || "noreply@cabinet-rimbault.fr",
            to: body.email,
            subject: email.subject,
            html: email.html,
          })
        })
        .catch((err) => console.error("[Email] Failed to send evaluation confirmation:", err))

      settingsPromise
        .then((settings) => {
          const email = evaluationNotificationEmail({ evaluation })
          return sendAgencyNotification({
            kind: "evaluation",
            settingsEmail: settings?.email,
            replyTo: evaluation.email,
            subject: email.subject,
            html: email.html,
          })
        })
        .catch((err) =>
          console.error(
            `[Email] Échec de la notification agence (evaluation ${evaluation.id}):`,
            err,
          ),
        )

      return NextResponse.json(
        {
          success: true,
          message: SUCCESS_MESSAGE,
          data: {
            id: evaluation.id,
            createdAt: evaluation.createdAt,
          },
        },
        { status: 201 },
      )
    } catch (error) {
      console.error("Error creating public evaluation:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de la création de la demande d'estimation",
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
