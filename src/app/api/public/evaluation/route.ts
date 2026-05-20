import { NextRequest, NextResponse } from "next/server"
import { PropertyCondition } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import { resend } from "@/lib/resend"
import { evaluationConfirmationEmail } from "@/lib/emails/evaluation-confirmation"

const PROPERTY_CONDITION_VALUES = Object.values(PropertyCondition) as string[]

// POST /api/public/evaluation - Créer une nouvelle demande d'estimation
// Protégé par X-API-Key
export async function POST(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    try {
      const body = await req.json()
      console.log("Received public evaluation request:", JSON.stringify(body, null, 2))

      // Validation des champs requis
      const requiredFields = ["propertyType", "postalCode", "firstName", "lastName", "email"]
      for (const field of requiredFields) {
        if (!body[field]) {
          return NextResponse.json(
            { success: false, error: `Le champ ${field} est requis` },
            { status: 400 }
          )
        }
      }

      // Validation du code postal (5 chiffres)
      if (!/^\d{5}$/.test(body.postalCode)) {
        return NextResponse.json(
          { success: false, error: "Le code postal doit contenir 5 chiffres" },
          { status: 400 }
        )
      }

      // Validation de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(body.email)) {
        return NextResponse.json(
          { success: false, error: "L'adresse email n'est pas valide" },
          { status: 400 }
        )
      }

      // Validation du champ `condition` (enum PropertyCondition, optionnel)
      if (body.condition != null && !PROPERTY_CONDITION_VALUES.includes(body.condition)) {
        return NextResponse.json(
          { success: false, error: "La valeur de `condition` est invalide" },
          { status: 400 }
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

      console.log("Public evaluation created successfully:", evaluation.id)

      // Fire-and-forget email
      prisma.agencySettings.findUnique({ where: { id: 'default' } })
        .then((settings) => {
          const email = evaluationConfirmationEmail({
            firstName: body.firstName,
            lastName: body.lastName,
            propertyType: body.propertyType,
            postalCode: body.postalCode,
            surface: body.surface ? Number(body.surface) : undefined,
            rooms: body.rooms ? Number(body.rooms) : undefined,
            agencyName: settings?.name || 'Cabinet Rimbault',
            agencyPhone: settings?.phone || undefined,
            agencyEmail: settings?.email || undefined,
          })
          return resend.emails.send({
            from: process.env.AGENCY_EMAIL_FROM || 'noreply@cabinet-rimbault.fr',
            to: body.email,
            subject: email.subject,
            html: email.html,
          })
        })
        .catch((err) => console.error('[Email] Failed to send evaluation confirmation:', err))

      return NextResponse.json({
        success: true,
        message: "Votre demande d'estimation a été enregistrée avec succès",
        data: {
          id: evaluation.id,
          createdAt: evaluation.createdAt,
        },
      }, { status: 201 })
    } catch (error) {
      console.error("Error creating public evaluation:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de la création de la demande d'estimation",
          details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
        },
        { status: 500 }
      )
    }
  })
}
