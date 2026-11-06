import { describe, expect, it } from "vitest"
import {
  escapeHtml,
  formatPlainCount,
  formatReceivedAt,
  formatRooms,
  formatSurface,
  intentLabel,
  parseDecimal,
  propertyTypeLabel,
  telHref,
  text,
} from "../format"

const NBSP = " "

describe("formatRooms (A34)", () => {
  it("accorde le nombre de pièces", () => {
    expect(formatRooms("1")).toBe(`1${NBSP}pièce`)
    expect(formatRooms("3")).toBe(`3${NBSP}pièces`)
    expect(formatRooms(3)).toBe(`3${NBSP}pièces`)
  })

  it("écrit « 5 pièces ou plus » pour « 5+ »", () => {
    expect(formatRooms("5+")).toBe(`5${NBSP}pièces ou plus`)
    expect(formatRooms(" 5 + ")).toBe(`5${NBSP}pièces ou plus`)
  })

  it("renvoie null pour une valeur absente, jamais « NaN »", () => {
    for (const value of [undefined, null, "", "  ", Number.NaN, {}, []]) {
      expect(formatRooms(value)).toBeNull()
    }
  })
})

describe("formatSurface (A34)", () => {
  it("écrit la surface à la française", () => {
    expect(formatSurface("59.5")).toBe(`59,5${NBSP}m²`)
    expect(formatSurface("59,5")).toBe(`59,5${NBSP}m²`)
    expect(formatSurface(59.5)).toBe(`59,5${NBSP}m²`)
    expect(formatSurface("120")).toBe(`120${NBSP}m²`)
  })

  it("renvoie null pour une valeur absente", () => {
    expect(formatSurface(undefined)).toBeNull()
    expect(formatSurface(null)).toBeNull()
    expect(formatSurface("")).toBeNull()
    expect(formatSurface(Number.NaN)).toBeNull()
  })

  it("recopie une valeur illisible au lieu d'écrire « NaN »", () => {
    expect(formatSurface("environ 60")).toBe("environ 60")
    expect(parseDecimal("environ 60")).toBeNull()
  })
})

describe("autres formats", () => {
  it("formatPlainCount", () => {
    expect(formatPlainCount("2")).toBe("2")
    expect(formatPlainCount("4+")).toBe("4 ou plus")
    expect(formatPlainCount(undefined)).toBeNull()
  })

  it("intentLabel dit l'objet en clair", () => {
    expect(intentLabel("ESTIMATION_VENTE")).toBe("Estimation du prix de vente")
    expect(intentLabel("ESTIMATION_LOYER")).toBe("Estimation du loyer")
    expect(intentLabel(undefined)).toBe("Demande d’estimation")
    expect(intentLabel("AUTRE")).toBe("Demande d’estimation")
    // Valeurs de la vitrine précédente (transition API avant vitrine).
    expect(intentLabel("SELL")).toBe("Estimation du prix de vente")
    expect(intentLabel("RENT_OUT")).toBe("Estimation du loyer")
    expect(intentLabel("EXPLORATION")).toBe("Demande d’estimation")
  })

  it("propertyTypeLabel", () => {
    expect(propertyTypeLabel("APPARTEMENT")).toBe("Appartement")
    expect(propertyTypeLabel("maison")).toBe("Maison")
    expect(propertyTypeLabel(null)).toBeNull()
  })

  it("formatReceivedAt à l'heure de Paris", () => {
    expect(formatReceivedAt(new Date("2026-10-30T13:12:00Z"))).toBe(
      `le 30/10/2026 à 14${NBSP}h${NBSP}12`,
    )
    expect(formatReceivedAt(new Date("2026-07-01T06:05:00Z"))).toBe(
      `le 01/07/2026 à 08${NBSP}h${NBSP}05`,
    )
  })

  it("telHref garde les chiffres et le +", () => {
    expect(telHref("06 12 34 56 78")).toBe("tel:0612345678")
    expect(telHref("+33 6 12 34 56 78")).toBe("tel:+33612345678")
    expect(telHref("")).toBeNull()
  })

  it("text nettoie et rejette les types inattendus", () => {
    expect(text("  a ")).toBe("a")
    expect(text(Number.POSITIVE_INFINITY)).toBeNull()
    expect(text(true)).toBeNull()
  })

  it("escapeHtml", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe(
      "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;",
    )
  })
})
