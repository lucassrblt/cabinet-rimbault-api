# Cabinet Rimbault — API publique

Service Next.js (route handlers uniquement) qui sert l'API publique consommée par la vitrine `cabinet-rimbault.fr`. Extraite du back-office admin (`cabinet-rimbault-admin`) pour découpler les cycles de déploiement : l'admin peut tomber, l'API reste up, la vitrine continue de servir.

🔗 **En production :** alimente [cabinet-rimbault.fr](https://cabinet-rimbault.fr) · back-office [admin.cabinet-rimbault.fr](https://admin.cabinet-rimbault.fr)

## Stack

- Next.js 15 (App Router) — route handlers seuls, pas d'UI hors page d'accueil minimale.
- Prisma 5 + PostgreSQL Supabase (partagé avec l'admin).
- Resend pour les emails de confirmation contact / évaluation.
- Zod pour la validation des payloads.
- Biome (lint + format), Husky (pre-commit), GitHub Actions (CI).

## Setup local

```bash
git clone https://github.com/lucassrblt/cabinet-rimbault-api.git
cd cabinet-rimbault-api
npm ci
cp .env.example .env.local        # puis remplir les valeurs (cf. ci-dessous)
npm run dev                       # http://localhost:3002
```

Le repo `cabinet-rimbault-admin` doit être présent au même niveau (`../cabinet-rimbault-admin/`) pour que `npm run sync-schema` fonctionne.

## Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Dev server Next.js sur port **3002** (admin: 3000, vitrine: 3001). |
| `npm run build` | Build production. |
| `npm start` | Start production (lit `PORT` env var, fallback 3000). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | Biome check. |
| `npm run lint:fix` | Biome fix auto. |
| `npm run format` | Biome format. |
| `npm run sync-schema` | Recopie `prisma/schema.prisma` depuis `../cabinet-rimbault-admin/` puis `prisma generate`. |

## Variables d'environnement

Cf. `.env.example` pour la liste complète.

| Variable | Requise | Description |
|---|---|---|
| `DATABASE_URL` | oui | URL pooled Supabase Postgres (même que l'admin). |
| `PUBLIC_API_KEY` | oui | Clé X-API-Key attendue dans les requêtes. Doit matcher la valeur configurée côté vitrine. |
| `RESEND_API_KEY` | non | Si absent, aucun email n'est envoyé (warning dans les logs). |
| `AGENCY_EMAIL_FROM` | non | Expéditeur Resend vérifié (ex. `Cabinet Rimbault <contact@cabinet-rimbault.fr>`). |
| `AGENCY_NOTIFICATION_EMAIL` | non | Destinataire des notifications de leads (contact + estimation). Si absent : `AgencySettings.email` (paramètres de l'agence dans l'admin). Si aucun des deux n'est renseigné, la notification n'est pas envoyée et une erreur est loggée. |
| `PROPERTY_PAGE_URL_TEMPLATE` | non | Gabarit d'URL de la fiche bien sur la vitrine, ex. `https://cabinet-rimbault.fr/bien/{reference}`. Sert au lien dans la notification agence ; si absent, seule la référence est indiquée. |
| `CORS_ALLOWED_ORIGINS` | non | Origines additionnelles (séparées par virgules). Les origines vitrine prod + localhost sont déjà whitelistées par défaut dans `src/middleware.ts`. |

## Endpoints

Tous protégés par header `X-API-Key` (sauf `/api/health`).

| Méthode | Path | Rôle |
|---|---|---|
| GET | `/api/health` | Healthcheck (db ping). Public. |
| GET | `/api/public/properties` | Recherche paginée (36 query params). |
| GET | `/api/public/properties/sale` | Biens en vente. |
| GET | `/api/public/properties/rent` | Biens en location. |
| GET | `/api/public/properties/recent` | Biens récents (limit param). |
| GET | `/api/public/properties/[reference]` | Détail bien + incrément view counter. |
| GET | `/api/public/properties/[reference]/similar` | Biens similaires. |
| POST | `/api/public/contact` | Crée un Lead + email de confirmation à l'expéditeur + notification à l'agence. Anti-spam (cf. ci-dessous). |
| POST | `/api/public/evaluation` | Crée une Evaluation + email de confirmation au demandeur + notification à l'agence. Anti-spam (cf. ci-dessous). |

Toutes les réponses sont au format `{ success, data, ... }`. Les biens non publiés et les statuts internes ne sont jamais renvoyés.

### Données exposées pour un bien

Tous les endpoints qui renvoient des biens (liste, `sale`, `rent`, `recent`, détail, `similar`) passent par `sanitizePropertyForPublic` (`src/lib/api-public-helpers.ts`), point de passage unique du mapping public.

**Jamais exposés :**

- Champs internes de `Property` : `internalNotes`, `userId`, `user`, `viewCount`, `contactCount`, `favoriteCount`, `isPublished`.
- Dans `location` : `address`, `addressComplement`, `cadastralRef`, `latitude`, `longitude` (l'adresse exacte d'un bien ne doit pas être publique).

**`location` exposée :**

```ts
location: {
  id: string
  propertyId: string
  city: string
  postalCode: string
  department: string | null
  region: string | null
  neighborhood: string | null
  // Coordonnées arrondies à 2 décimales (≈ 1 km) pour une carte de secteur.
  // null si le bien n'a pas de coordonnées.
  approximate: { latitude: number; longitude: number } | null
} | null
```

**`documents` (fiche détail uniquement)** : seuls les types de la liste blanche `PUBLIC_DOCUMENT_TYPES` sont renvoyés — `LABEL_PDF`, `DPE`, `PLAN`, ainsi que `DPE_IMAGE` et `GES_IMAGE` (les images des étiquettes énergie ne sont stockées que dans `PropertyDocument`). Diagnostics amiante/plomb/électricité/gaz/termites, ERNMT, PV d'AG, règlement et carnet d'entretien de copropriété, `DESCRIPTIVE_SHEET_PDF` et `AUTRE` ne sont jamais exposés.

Le type TypeScript correspondant est `PublicProperty<T>` / `PublicPropertyLocation<L>`.

## Anti-spam (POST contact / évaluation)

Implémentation : `src/lib/rate-limit.ts` (limiteur générique) + `src/lib/api-public-antispam.ts`.

- **Honeypot** : champ optionnel `website` dans le body. La vitrine doit le rendre invisible pour les humains (et l'envoyer vide). S'il est non vide, l'API répond exactement comme un succès (`201`, `{ success: true, message, data: { id, createdAt } }` avec un id factice) **sans rien enregistrer ni envoyer**.
- **Rate limit** : 5 requêtes par 10 minutes, par IP et par endpoint (fenêtre glissante, en mémoire). Au-delà : `429` `{ success: false, error: "Trop de demandes, réessayez dans quelques minutes." }` avec header `Retry-After` (secondes). L'IP retenue est le premier IP de `X-Forwarded-For`, sinon `X-Real-IP`.

⚠️ La vitrine appelle l'API **depuis son serveur** : sans précaution, toutes les demandes arrivent avec l'IP du serveur vitrine et partagent le même compteur (5 leads / 10 min pour tout le site). La vitrine doit donc transmettre l'IP du visiteur dans `X-Forwarded-For` lors de ses appels POST. L'appel étant authentifié par `X-API-Key`, ce header est considéré comme fiable.

Le stockage en mémoire suffit pour une instance Railway unique ; il est remis à zéro à chaque redémarrage et ne serait pas partagé entre plusieurs instances (il faudrait alors un store partagé type Redis).

## Emails

Chaque lead (contact ou estimation) déclenche deux envois Resend, en fire-and-forget (la réponse HTTP n'attend pas l'envoi, un échec n'impacte pas la création du lead) :

1. **Confirmation** à l'internaute (`src/lib/emails/*-confirmation.tsx`).
2. **Notification à l'agence** (`src/lib/emails/lead-notification.ts`) : type de demande, référence + titre du bien (avec lien si `PROPERTY_PAGE_URL_TEMPLATE` est défini), coordonnées, message et, pour une estimation, les caractéristiques saisies. Envoyée à `AGENCY_NOTIFICATION_EMAIL` (sinon `AgencySettings.email`) avec `replyTo` = email de l'internaute : l'agent répond directement depuis sa messagerie.

Les échecs sont loggés avec le préfixe `[Email]` (et l'id du lead pour la notification).

## Schéma Prisma — règle d'or

**L'admin est le seul propriétaire du schéma et des migrations.** Le repo API ne fait que `prisma generate` à partir d'une copie versionnée de `schema.prisma`.

À chaque migration côté admin :

```bash
npm run sync-schema   # recopie + génère
npm run build         # vérifie que rien n'a régressé
git commit -am "chore: sync prisma schema"
```

## Deploy

Hébergement : **Railway** (au nom de la famille).

Config versionnée dans `railway.json` :
- Builder Nixpacks (auto-détection Next.js).
- Healthcheck : `GET /api/health`, timeout 30s.
- Restart policy : `ON_FAILURE` avec 3 retries max.

Variables d'env à poser côté Railway (Settings → Variables) : voir la table ci-dessus.

Le déploiement est déclenché automatiquement à chaque push sur `main` (cf. CI ci-dessous).

## CI/CD

`.github/workflows/ci.yml` lance sur chaque push `main` + PR :
- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

CI vert = code prêt à déployer. Le hook Husky `pre-commit` exécute lint + typecheck en local pour échouer plus tôt.

## Smoke test

Un script de smoke test paramétrable est fourni :

```bash
./scripts/smoke.sh https://api.cabinet-rimbault.fr <PUBLIC_API_KEY>
```

Exerce healthcheck + tous les endpoints + un preflight CORS. Exit 0 si tous les checks passent, 1 sinon. À lancer après chaque déploiement Railway pour valider la prod en 5 secondes.

## Architecture

```
cabinet-rimbault.fr           Vitrine (Netlify, SSG/ISR)
        ↓ fetch X-API-Key
api.cabinet-rimbault.fr       ← ce repo (Railway)
        ↓ Prisma
Supabase Postgres + Storage   (admin maître du schéma)
        ↑ Prisma
admin.cabinet-rimbault.fr     Back-office privé (Railway, NextAuth)
```

L'admin et l'API se partagent la base mais déploient indépendamment.
