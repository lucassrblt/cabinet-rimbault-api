import type { NextResponse } from "next/server"

export const LISTING_CACHE = "public, s-maxage=60, stale-while-revalidate=300"
export const DETAIL_CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export function withCache(res: NextResponse, value: string): NextResponse {
  res.headers.set("Cache-Control", value)
  return res
}
