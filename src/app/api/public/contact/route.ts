import { type NextRequest, NextResponse } from "next/server"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import { resendTransport } from "@/lib/emails/mailer"
import { prisma } from "@/lib/prisma"
import { handleContact } from "@/lib/public-forms/contact"
import { configFromEnv } from "@/lib/public-forms/notify"

// POST /api/public/contact - Créer un nouveau lead (formulaire de contact vitrine)
// Protégé par X-API-Key. Enregistre le message, puis envoie l'accusé au
// demandeur et la notification à l'agent (voir `lib/public-forms/contact`).
export async function POST(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ success: false, error: "Corps JSON invalide" }, { status: 400 })
    }

    const result = await handleContact(body, {
      db: prisma,
      transport: resendTransport(),
      config: configFromEnv(),
    })
    return NextResponse.json(result.body, { status: result.status })
  })
}
