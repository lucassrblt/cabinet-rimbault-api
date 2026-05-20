import { type NextRequest, NextResponse } from "next/server"

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://cabinet-rimbault.fr",
  "https://www.cabinet-rimbault.fr",
]

const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
])

const allowedMethods = "GET, POST, PUT, DELETE, OPTIONS"
const allowedHeaders = "Content-Type, X-API-Key, Authorization"

function applyCors(response: NextResponse, origin: string | null) {
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", allowedMethods)
    response.headers.set("Access-Control-Allow-Headers", allowedHeaders)
    response.headers.set("Access-Control-Max-Age", "86400")
    response.headers.set("Vary", "Origin")
  }
  return response
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }), origin)
  }

  return applyCors(NextResponse.next(), origin)
}

export const config = {
  matcher: ["/api/:path*"],
}
