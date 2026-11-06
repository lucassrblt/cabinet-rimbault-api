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
| `RESEND_API_KEY` | non | Si absent, aucun e-mail n'est envoyé (accusé : avertissement `[Email]` ; notification à l'agent : `console.error` `[Email][ALERTE]`) ; les demandes sont quand même enregistrées. |
| `AGENCY_EMAIL_FROM` | non | Expéditeur Resend vérifié (ex. `Cabinet Rimbault <contact@cabinet-rimbault.fr>`). |
| `AGENCY_NOTIFICATION_EMAIL` | recommandée | Boîte qui reçoit la notification de chaque demande (estimation, contact). À défaut : `AgencySettings.email` (admin). Sans l'une ni l'autre : notification non envoyée, alerte `[Email][ALERTE]` dans les logs. |
| `ADMIN_URL` | non | Racine de l'admin pour le lien « Ouvrir dans l'admin » (défaut `https://admin.cabinet-rimbault.fr`). |
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
| POST | `/api/public/contact` | Crée un Lead, puis accusé au demandeur + notification à l'agent. |
| POST | `/api/public/evaluation` | Crée une Evaluation, puis accusé au demandeur + notification à l'agent. |

Toutes les réponses sont au format `{ success, data, ... }` avec sanitization automatique (`internalNotes`, `userId` et brouillons retirés).

### Formulaires publics (`contact`, `evaluation`)

Logique dans `src/lib/public-forms/` (les routes ne font que brancher Prisma et Resend) :

1. Validation : 400 (`fields` pour `contact`).
2. Consentement : `rgpd !== true` (ou `consent.rgpd !== true`) → **422 `RGPD_REQUIRED`**, rien n'est créé.
3. Création en base, prioritaire : si elle échoue, 500 et aucun e-mail.
4. Deux e-mails **attendus** (pas de fire-and-forget) : accusé au demandeur (`replyTo` = cabinet) et notification à l'agent (`to` = `AGENCY_NOTIFICATION_EMAIL` ou `AgencySettings.email`, `replyTo` = demandeur). La première ligne de la notification dit l'objet en clair (« Estimation du prix de vente », « Estimation du loyer », « Demande au sujet d'un bien en vente »…), puis le récapitulatif complet et le lien vers l'admin.
5. Un échec d'e-mail est journalisé et ne fait jamais échouer la requête : 201. Accusé au demandeur : `[Email]`. Notification à l'agent (refus de Resend, exception, clé absente, destinataire absent) : `console.error` préfixé exactement `[Email][ALERTE]`, à surveiller sur Railway.

Gabarits dans `src/lib/emails/` : HTML en tableaux et styles en ligne (grenat `#5F1A24`, crème `#F8F2E9`, Georgia et police système), version texte, formatage commun dans `format.ts` (« 5 pièces ou plus », « 59,5 m² » ; jamais `NaN`, `undefined` ni `null`).

## Tests

```bash
npm test        # vitest : formatage, routes contact et évaluation avec base et transport Resend factices
```

Aucun test n'appelle Resend ni une base réelle.

## Ordre de déploiement (notification agent)

1. Poser `AGENCY_NOTIFICATION_EMAIL` (et vérifier `AGENCY_EMAIL_FROM`, `RESEND_API_KEY`) sur Railway.
2. Déployer **l'API d'abord**, puis la vitrine refondue. L'API reste compatible avec la vitrine actuelle (elle envoie déjà `rgpd: true`) ; la vitrine refondue envoie `intent` et le bloc `message` structuré que la notification met en forme.
3. Après déploiement : `./scripts/smoke.sh` (lecture seule), puis une demande d'essai depuis la vitrine de préproduction pour vérifier la réception dans la boîte de l'agent. Jamais de POST d'essai scripté contre la production.

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
- `npm test`
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
