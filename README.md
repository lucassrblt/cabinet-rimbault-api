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
| `RESEND_API_KEY` | non | Si absent, les emails sont silencieusement skip. |
| `AGENCY_EMAIL_FROM` | non | Expéditeur Resend vérifié (ex. `Cabinet Rimbault <contact@cabinet-rimbault.fr>`). |
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
| POST | `/api/public/contact` | Crée un Lead + email Resend. |
| POST | `/api/public/evaluation` | Crée une Evaluation + email Resend. |

Toutes les réponses sont au format `{ success, data, ... }` avec sanitization automatique (`internalNotes`, `userId` et brouillons retirés).

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
