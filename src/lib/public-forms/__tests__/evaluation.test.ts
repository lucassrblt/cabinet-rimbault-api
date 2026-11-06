import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import type { AgencySettingsLike } from "@/lib/emails/agency"
import { type EvaluationDeps, type EvaluationRecord, handleEvaluation } from "../evaluation"
import {
  AGENCY,
  agentMessage,
  CONFIG,
  expectCleanEmail,
  fakeTransport,
  plain,
  RECEIVED_AT,
  requesterMessage,
} from "./helpers"

const NBSP = " "
const REQUESTER = "marie.durand@example.test"

/** Charge utile du tunnel de la vitrine (doc 04 §3.4). */
function fullPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    propertyType: "APPARTEMENT",
    postalCode: "92600",
    address: "12 rue de la Station, Asnières-sur-Seine",
    surface: "59.5",
    rooms: "5+",
    bedrooms: "2",
    bathrooms: "1",
    constructionYear: "1949-1974",
    renovations: "Cuisine refaite en 2022",
    hasBalcony: true,
    hasTerrace: false,
    hasGarden: false,
    hasParking: true,
    condition: "BON_ETAT",
    intent: "ESTIMATION_VENTE",
    timeframe: "Dans les trois mois",
    situation: "vente",
    firstName: "Marie",
    lastName: "Durand",
    email: REQUESTER,
    phone: "06 12 34 56 78",
    message:
      "[Précisions saisies sur le site]\nÉtage : 3ᵉ sur 5, dernier étage : non\nAscenseur : oui\nCave : oui\nRecontact : par téléphone, en fin de journée\n\n[Message]\nVente envisagée au printemps.",
    rgpd: true,
    source: "vitrine/estimation",
    userAgent: "Mozilla/5.0",
    referer: "/vendre",
    ...overrides,
  }
}

/** Seuls les champs requis (tous les facultatifs absents). */
function minimalPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    propertyType: "MAISON",
    postalCode: "92600",
    firstName: "Marie",
    lastName: "Durand",
    email: REQUESTER,
    rgpd: true,
    ...overrides,
  }
}

function fakeDb(
  options: {
    settings?: AgencySettingsLike | null
    createFails?: boolean
    settingsFail?: boolean
  } = {},
) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (options.createFails) throw new Error("base indisponible")
    return { ...data, id: "cm_eval_1", createdAt: RECEIVED_AT } as unknown as EvaluationRecord
  })
  const findUnique = vi.fn(async () => {
    if (options.settingsFail) throw new Error("lecture impossible")
    return options.settings === undefined ? AGENCY : options.settings
  })
  return {
    db: {
      evaluation: { create },
      agencySettings: { findUnique },
    } as unknown as EvaluationDeps["db"],
    create,
  }
}

let errorSpy: MockInstance
let warnSpy: MockInstance

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/public/evaluation", () => {
  it("crée la demande, puis envoie l'accusé et la notification à l'agent", async () => {
    const { db, create } = fakeDb()
    const { transport, sent } = fakeTransport()

    const result = await handleEvaluation(fullPayload(), { db, transport, config: CONFIG })

    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({ success: true, data: { id: "cm_eval_1" } })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].data).toMatchObject({
      surface: "59.5",
      rooms: "5+",
      intent: "ESTIMATION_VENTE",
      timeframe: "Dans les trois mois",
      situation: "VENTE",
      hasGarage: true,
      rgpd: true,
      status: "NOUVELLE",
    })
    expect(transport.send).toHaveBeenCalledTimes(2)

    const agent = agentMessage(sent, REQUESTER)
    expect(agent.to).toBe("agent@example.test")
    expect(agent.replyTo).toBe(REQUESTER)
    expect(agent.from).toBe(CONFIG.from)
    expect(agent.subject).toBe(
      `Estimation du prix de vente, appartement de 59,5${NBSP}m², 5${NBSP}pièces ou plus, 92600, Marie Durand`,
    )
    expect(agent.text.split("\n")[0]).toBe("Estimation du prix de vente")
    expect(agent.html).toContain(">Estimation du prix de vente</h1>")

    const requester = requesterMessage(sent, REQUESTER)
    expect(requester.replyTo).toBe("cabinet@example.test")
    expect(requester.subject).toBe("Votre demande d’estimation est bien arrivée")

    for (const message of sent) expectCleanEmail(message)
  })

  it("récapitule tous les champs envoyés par le tunnel", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    await handleEvaluation(fullPayload(), { db, transport, config: CONFIG })
    const { text, html } = agentMessage(sent, REQUESTER)

    for (const line of [
      "Nom : Marie Durand",
      "Téléphone : 06 12 34 56 78",
      `E-mail : ${REQUESTER}`,
      "Préférence de recontact : Par téléphone, en fin de journée",
      "Objet : Estimation du prix de vente",
      "Échéance du projet : Dans les trois mois",
      "Type de bien : Appartement",
      "Adresse : 12 rue de la Station, Asnières-sur-Seine",
      "Code postal : 92600",
      `Surface habitable : 59,5${NBSP}m²`,
      `Pièces : 5${NBSP}pièces ou plus`,
      "Chambres : 2",
      "Salles de bains ou d’eau : 1",
      "Extérieurs et annexes : Balcon, garage ou parking",
      "État général : Bon état",
      "Époque de construction : 1949-1974",
      "Travaux récents : Cuisine refaite en 2022",
      `Consentement RGPD : Oui, donné le 30/10/2026 à 14${NBSP}h${NBSP}12`,
      "Page d’entrée : /vendre",
      "Admin : https://admin.example.test/estimations/cm_eval_1",
    ]) {
      expect(plain(text)).toContain(plain(line))
    }
    expect(text).toContain("Ascenseur : oui\nCave : oui")
    expect(text).toContain("Vente envisagée au printemps.")
    expect(html).toContain('href="tel:0612345678"')
    expect(html).toContain(`href="mailto:${REQUESTER}"`)
    expect(html).toContain('href="https://admin.example.test/estimations/cm_eval_1"')
    // Un appartement sans niveaux saisis : la ligne est omise.
    expect(text).not.toContain("Niveaux")
  })

  it("dit « Estimation du loyer » en première ligne pour ESTIMATION_LOYER", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    await handleEvaluation(fullPayload({ intent: "ESTIMATION_LOYER" }), {
      db,
      transport,
      config: CONFIG,
    })
    const agent = agentMessage(sent, REQUESTER)
    expect(agent.text.split("\n")[0]).toBe("Estimation du loyer")
    expect(agent.subject.startsWith("Estimation du loyer, appartement")).toBe(true)
    expect(requesterMessage(sent, REQUESTER).text).toContain("estimation du loyer")
  })

  it("reste propre quand tous les champs facultatifs sont absents (A34)", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    const result = await handleEvaluation(minimalPayload(), { db, transport, config: CONFIG })

    expect(result.status).toBe(201)
    expect(sent).toHaveLength(2)
    for (const message of sent) expectCleanEmail(message)

    const agent = agentMessage(sent, REQUESTER)
    expect(agent.subject).toBe("Demande d’estimation, maison, 92600, Marie Durand")
    expect(plain(agent.text)).toContain("Téléphone : Pas de réponse")
    expect(plain(agent.text)).toContain("Surface habitable : Pas de réponse")
    expect(plain(agent.text)).toContain("Niveaux : Pas de réponse")
    expect(plain(agent.text)).toContain("Extérieurs et annexes : Aucun")
    expect(agent.text).toContain("Aucune précision ni message.")
    expect(agent.text).not.toContain("Préférence de recontact")
    expect(agent.text).not.toContain("Page d’entrée")
    expect(agent.html).not.toContain("tel:")
  })

  it("accepte des nombres JSON et des chaînes vides sans rien afficher de brut", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    await handleEvaluation(
      minimalPayload({ surface: 59.5, rooms: 3, bedrooms: "", phone: "", address: "   " }),
      { db, transport, config: CONFIG },
    )
    for (const message of sent) expectCleanEmail(message)
    expect(plain(agentMessage(sent, REQUESTER).text)).toContain("Surface habitable : 59,5 m²")
  })

  it("échappe le HTML saisi par le visiteur", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    await handleEvaluation(
      fullPayload({ lastName: "<script>alert(1)</script>", message: "<b>gras</b>" }),
      { db, transport, config: CONFIG },
    )
    for (const message of sent) {
      expect(message.html).not.toContain("<script>")
      expect(message.html).not.toContain("<b>gras</b>")
    }
    expect(agentMessage(sent, REQUESTER).html).toContain("&lt;b&gt;gras&lt;/b&gt;")
  })

  it("utilise agencySettings.email si AGENCY_NOTIFICATION_EMAIL est absente", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    await handleEvaluation(fullPayload(), {
      db,
      transport,
      config: { ...CONFIG, notificationEmail: undefined },
    })
    expect(agentMessage(sent, REQUESTER).to).toBe("cabinet@example.test")
  })

  it("crée la demande et journalise une alerte si aucun destinataire n'est configuré", async () => {
    const { db, create } = fakeDb({ settings: { ...AGENCY, email: null } })
    const { transport, sent } = fakeTransport()
    const result = await handleEvaluation(fullPayload(), {
      db,
      transport,
      config: { ...CONFIG, notificationEmail: "  " },
    })
    expect(result.status).toBe(201)
    expect(create).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(REQUESTER)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[ALERTE]"))
  })

  it("ne fait pas échouer la requête si Resend refuse la notification", async () => {
    const { db, create } = fakeDb()
    const { transport, sent } = fakeTransport((message) =>
      message.to === "agent@example.test"
        ? { data: null, error: { name: "validation_error", message: "refusé" } }
        : { data: { id: "ok" }, error: null },
    )
    const result = await handleEvaluation(fullPayload(), { db, transport, config: CONFIG })
    expect(result.status).toBe(201)
    expect(create).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(2)
    expect(errorSpy).toHaveBeenCalledWith(
      `[Email][ALERTE] Échec : notification d'estimation à l'agent (évaluation cm_eval_1).`,
      expect.objectContaining({ message: "refusé" }),
    )
  })

  it("ne fait pas échouer la requête si le transport lève une exception", async () => {
    const { db } = fakeDb()
    const { transport } = fakeTransport(() => {
      throw new Error("réseau")
    })
    const result = await handleEvaluation(fullPayload(), { db, transport, config: CONFIG })
    expect(result.status).toBe(201)
    expect(errorSpy).toHaveBeenCalledTimes(2)
    // Notification : alerte ; accusé au demandeur : simple journal « [Email] ».
    expect(errorSpy).toHaveBeenCalledWith(
      `[Email][ALERTE] Échec : notification d'estimation à l'agent (évaluation cm_eval_1).`,
      expect.objectContaining({ message: "réseau" }),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[Email\] Échec : accusé d'estimation/),
      expect.any(Error),
    )
  })

  it("envoie quand même les e-mails si agencySettings est illisible", async () => {
    const { db } = fakeDb({ settingsFail: true })
    const { transport, sent } = fakeTransport()
    const result = await handleEvaluation(fullPayload(), { db, transport, config: CONFIG })
    expect(result.status).toBe(201)
    expect(sent).toHaveLength(2)
    for (const message of sent) expectCleanEmail(message)
  })

  it("sans RESEND_API_KEY : demande créée, envoi ignoré et signalé", async () => {
    const { db, create } = fakeDb()
    const result = await handleEvaluation(fullPayload(), { db, transport: null, config: CONFIG })
    expect(result.status).toBe(201)
    expect(create).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      `[Email][ALERTE] RESEND_API_KEY absente : envoi ignoré, notification d'estimation à l'agent (évaluation cm_eval_1).`,
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[Email\] RESEND_API_KEY absente : envoi ignoré, accusé d'estimation/,
      ),
    )
  })

  it("garde l'objet et l'accueil sur une ligne malgré un CR/LF dans le prénom", async () => {
    const { db } = fakeDb()
    const { transport, sent } = fakeTransport()
    const result = await handleEvaluation(
      fullPayload({ firstName: "Marie\r\nBcc: x@evil.test", lastName: " Durand\t\n" }),
      { db, transport, config: CONFIG },
    )
    expect(result.status).toBe(201)
    for (const message of sent) expect(message.subject).not.toMatch(/[\r\n\t]/)
    const agent = agentMessage(sent, REQUESTER)
    expect(agent.subject).toMatch(/, 92600, Marie Bcc: x@evil\.test Durand$/)
    const requester = requesterMessage(sent, REQUESTER)
    expect(requester.text.split("\n")[1]).toBe(
      "Merci, Marie Bcc: x@evil.test. Nous avons bien reçu votre demande d’estimation du prix de vente.",
    )
  })

  it("400 si le prénom ou le nom dépasse 80 caractères (doc 04 §3.3)", async () => {
    const { db, create } = fakeDb()
    const { transport, sent } = fakeTransport()
    const deps = { db, transport, config: CONFIG }
    expect((await handleEvaluation(fullPayload({ firstName: "M".repeat(81) }), deps)).status).toBe(
      400,
    )
    expect((await handleEvaluation(fullPayload({ lastName: "D".repeat(81) }), deps)).status).toBe(
      400,
    )
    expect(create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
    const ok = await handleEvaluation(
      fullPayload({ firstName: "M".repeat(80), lastName: "D".repeat(80) }),
      deps,
    )
    expect(ok.status).toBe(201)
    // Objet borné à 200 caractères même avec deux noms de 80 caractères.
    const agent = agentMessage(sent, REQUESTER)
    expect(agent.subject.length).toBeLessThanOrEqual(200)
    expect(agent.subject.endsWith("…")).toBe(true)
  })

  it.each([
    ["false", false],
    ["absent", undefined],
    ["chaîne « true »", "true"],
  ])("refuse rgpd %s : 422 RGPD_REQUIRED, rien créé ni envoyé", async (_label, rgpd) => {
    const { db, create } = fakeDb()
    const { transport, sent } = fakeTransport()
    const result = await handleEvaluation(fullPayload({ rgpd }), { db, transport, config: CONFIG })
    expect(result.status).toBe(422)
    expect(result.body).toMatchObject({ success: false, code: "RGPD_REQUIRED" })
    expect(create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it("400 si un champ requis manque ou est invalide", async () => {
    const { db, create } = fakeDb()
    const { transport } = fakeTransport()
    const deps = { db, transport, config: CONFIG }
    expect((await handleEvaluation(fullPayload({ email: "" }), deps)).status).toBe(400)
    expect((await handleEvaluation(fullPayload({ postalCode: "926" }), deps)).status).toBe(400)
    expect((await handleEvaluation(fullPayload({ email: "pas-un-mail" }), deps)).status).toBe(400)
    expect((await handleEvaluation(fullPayload({ condition: "SUPERBE" }), deps)).status).toBe(400)
    expect((await handleEvaluation([], deps)).status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("500 sans e-mail si la création en base échoue", async () => {
    const { db } = fakeDb({ createFails: true })
    const { transport, sent } = fakeTransport()
    const result = await handleEvaluation(fullPayload(), { db, transport, config: CONFIG })
    expect(result.status).toBe(500)
    expect(sent).toHaveLength(0)
  })
})
