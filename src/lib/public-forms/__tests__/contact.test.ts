import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { type ContactDeps, handleContact, type LeadRecord } from "../contact"
import {
  agentMessage,
  CONFIG,
  expectCleanEmail,
  fakeTransport,
  plain,
  RECEIVED_AT,
  requesterMessage,
} from "./helpers"

const REQUESTER = "paul.martin@example.test"

/** Charge utile du formulaire de contact de la vitrine (fiche d'un bien). */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subject: "BIEN_SALE",
    propertyReference: "10.131",
    contact: {
      firstName: "Paul",
      lastName: "Martin",
      email: REQUESTER,
      phone: "06 98 76 54 32",
      message: "Bonjour,\nle bien est-il toujours disponible ?\nMerci.",
    },
    consent: { rgpd: true },
    meta: { source: "vitrine/fiche", page: "/biens/10.131", referer: "/biens" },
    ...overrides,
  }
}

function fakeDb(options: { createFails?: boolean } = {}) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (options.createFails) throw new Error("base indisponible")
    return { ...data, id: "cm_lead_1", createdAt: RECEIVED_AT } as unknown as LeadRecord
  })
  const findUnique = vi.fn(async () => ({
    name: "Cabinet Rimbault",
    email: "cabinet@example.test",
  }))
  return {
    db: { lead: { create }, agencySettings: { findUnique } } as unknown as ContactDeps["db"],
    create,
  }
}

/** Les références de biens (« 10.131 ») sont les seuls points autorisés. */
const REFERENCE = /10\.131/g

let errorSpy: MockInstance

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/public/contact", () => {
  it("crée le lead, puis envoie l'accusé et la notification à l'agent", async () => {
    const { db, create } = fakeDb()
    const { transport, sent } = fakeTransport()

    const result = await handleContact(payload(), { db, transport, config: CONFIG })

    expect(result.status).toBe(201)
    expect(create).toHaveBeenCalledTimes(1)
    expect(transport.send).toHaveBeenCalledTimes(2)

    const agent = agentMessage(sent, REQUESTER)
    expect(agent.to).toBe("agent@example.test")
    expect(agent.replyTo).toBe(REQUESTER)
    expect(agent.subject).toBe("Demande au sujet d’un bien en vente, réf. 10.131, Paul Martin")
    expect(agent.text.split("\n")[0]).toBe("Demande au sujet d’un bien en vente")
    for (const line of [
      "Nom : Paul Martin",
      "Téléphone : 06 98 76 54 32",
      `E-mail : ${REQUESTER}`,
      "Référence du bien : 10.131",
      "Page du formulaire : /biens/10.131",
      "Page d’entrée : /biens",
      "Admin : https://admin.example.test/leads/cm_lead_1",
    ]) {
      expect(plain(agent.text)).toContain(plain(line))
    }
    expect(agent.text).toContain("le bien est-il toujours disponible ?")
    expect(agent.html).toContain('href="tel:0698765432"')

    expect(requesterMessage(sent, REQUESTER).subject).toBe(
      "Votre message au sujet du bien 10.131 est bien arrivé",
    )
    for (const message of sent) expectCleanEmail(message, { allowDots: REFERENCE })
  })

  it("reste propre sans les champs facultatifs", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    const result = await handleContact(
      {
        subject: "OTHER",
        contact: { firstName: "Paul", lastName: "Martin", email: REQUESTER, message: "Bonjour" },
        consent: { rgpd: true },
      },
      { db, transport, config: CONFIG },
    )
    expect(result.status).toBe(201)
    for (const message of sent) expectCleanEmail(message)
    const agent = agentMessage(sent, REQUESTER)
    expect(agent.subject).toBe("Message envoyé depuis le site, Paul Martin")
    expect(plain(agent.text)).toContain("Téléphone : Pas de réponse")
    expect(agent.text).not.toContain("Référence du bien")
  })

  it("ne fait pas échouer la requête si la notification échoue", async () => {
    const { db, create } = fakeDb()
    const { transport } = fakeTransport((message) => {
      if (message.to === "agent@example.test") throw new Error("réseau")
      return { data: { id: "ok" }, error: null }
    })
    const result = await handleContact(payload(), { db, transport, config: CONFIG })
    expect(result.status).toBe(201)
    expect(create).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      "[Email][ALERTE] Échec : notification de contact à l'agent (lead cm_lead_1).",
      expect.any(Error),
    )
  })

  it("422 RGPD_REQUIRED si le consentement est refusé", async () => {
    const { db, create } = fakeDb()
    const { transport, sent } = fakeTransport()
    const result = await handleContact(payload({ consent: { rgpd: false } }), {
      db,
      transport,
      config: CONFIG,
    })
    expect(result.status).toBe(422)
    expect(result.body).toMatchObject({ code: "RGPD_REQUIRED" })
    expect(create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it("400 avec `fields` si le corps est invalide", async () => {
    const { db } = fakeDb()
    const { transport } = fakeTransport()
    const result = await handleContact(payload({ subject: "INCONNU" }), {
      db,
      transport,
      config: CONFIG,
    })
    expect(result.status).toBe(400)
    expect(result.body).toHaveProperty("fields.subject")
  })

  it("500 sans e-mail si la création en base échoue", async () => {
    const { db } = fakeDb({ createFails: true })
    const { transport, sent } = fakeTransport()
    const result = await handleContact(payload(), { db, transport, config: CONFIG })
    expect(result.status).toBe(500)
    expect(sent).toHaveLength(0)
  })
})
