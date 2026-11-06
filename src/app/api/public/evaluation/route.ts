import { type NextRequest, NextResponse } from "next/server"
import { withPublicApiAuth } from "@/lib/api-public-auth"
import { resendTransport } from "@/lib/emails/mailer"
import { prisma } from "@/lib/prisma"
import { handleEvaluation } from "@/lib/public-forms/evaluation"
import { configFromEnv } from "@/lib/public-forms/notify"

// POST /api/public/evaluation - Créer une nouvelle demande d'estimation
// Protégé par X-API-Key. Enregistre la demande, puis envoie l'accusé au
// demandeur et la notification à l'agent (voir `lib/public-forms/evaluation`).
export async function POST(request: NextRequest) {
  return withPublicApiAuth(request, async (req) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ success: false, error: "Corps JSON invalide" }, { status: 400 })
    }

    const result = await handleEvaluation(body, {
      db: prisma,
      transport: resendTransport(),
      config: configFromEnv(),
    })
    return NextResponse.json(result.body, { status: result.status })
  })
}
