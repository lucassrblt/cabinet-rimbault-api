import { describe, expect, it } from "vitest"
import { agencyInfo } from "../agency"
import { contactAgentSubject, type LeadForEmail } from "../contact-agent-notification"
import { contactConfirmationEmail } from "../contact-confirmation"
import { evaluationConfirmationEmail } from "../evaluation-confirmation"
import { fullName, joinSubject, oneLine } from "../format"

const createdAt = new Date("2026-10-30T13:12:00Z")

const lead: LeadForEmail = {
  id: "cm_lead_1",
  createdAt,
  subject: "OTHER",
  firstName: "Paul",
  lastName: "Martin",
  email: "paul.martin@example.test",
  message: "Bonjour",
  rgpd: true,
}

const SETTINGS = {
  name: "Cabinet Rimbault",
  address: "117 boulevard Voltaire",
  postalCode: "92600",
  city: "Asnières-sur-Seine",
  phone: "01 73 64 56 10",
  email: "cabinet@example.test",
}

describe("accusé de contact, section « Nous joindre »", () => {
  it("avec téléphone et e-mail : téléphone puis « ou répondez à cet e-mail »", () => {
    const mail = contactConfirmationEmail(lead, agencyInfo(SETTINGS))
    expect(mail.text).toContain(
      "Nous joindre\n------------\nPour nous joindre directement : 01 73 64 56 10 ou répondez à cet e-mail.\nCabinet Rimbault",
    )
    expect(mail.html).toContain('href="tel:0173645610"')
  })

  it("sans téléphone, avec e-mail : invitation à répondre", () => {
    const mail = contactConfirmationEmail(lead, agencyInfo({ ...SETTINGS, phone: null }))
    expect(mail.text).toContain(
      "Nous joindre\n------------\nPour nous écrire, répondez simplement à cet e-mail.\nCabinet Rimbault",
    )
  })

  it("ni téléphone ni e-mail : pas de section", () => {
    const mail = contactConfirmationEmail(
      lead,
      agencyInfo({ ...SETTINGS, phone: null, email: null }),
    )
    expect(mail.text).not.toContain("Nous joindre")
    expect(mail.html).not.toContain("Nous joindre")
  })
})

describe("version texte et adresse du cabinet", () => {
  it("sépare la signature par « -- » suivi d'une espace", () => {
    const agency = agencyInfo(SETTINGS)
    expect(contactConfirmationEmail(lead, agency).text.split("\n")).toContain("-- ")
    const evaluation = {
      id: "e",
      createdAt,
      propertyType: "MAISON",
      postalCode: "92600",
      firstName: "Marie",
      lastName: "Durand",
      email: "m@example.test",
    }
    expect(evaluationConfirmationEmail(evaluation, agency).text.split("\n")).toContain("-- ")
  })

  it("lie le code postal et la ville par une espace insécable", () => {
    expect(agencyInfo(SETTINGS).address).toBe("117 boulevard Voltaire, 92600 Asnières-sur-Seine")
  })
})

describe("objets sur une ligne", () => {
  it("réduit espaces et retours à la ligne à une espace", () => {
    expect(oneLine(" Marie\r\nBcc:\t x@evil.test ")).toBe("Marie Bcc: x@evil.test")
    expect(fullName("Marie\r\n", "\nDurand")).toBe("Marie Durand")
    expect(contactAgentSubject({ ...lead, firstName: "Paul\r\nBcc: x@evil.test" })).toBe(
      "Message envoyé depuis le site, Paul Bcc: x@evil.test Martin",
    )
  })

  it("borne l'objet à 200 caractères", () => {
    const subject = joinSubject(["Objet", "x".repeat(300)])
    expect(subject).toHaveLength(200)
    expect(subject.endsWith("…")).toBe(true)
    expect(joinSubject(["Objet", null, "", "Marie"])).toBe("Objet, Marie")
  })
})
