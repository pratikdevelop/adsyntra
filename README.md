# AdSyntra

**A unified workspace for managing Google Ads and Meta Ads.**

AdSyntra is a web application that brings Google Ads and Meta Ads workflows into one interface. The project includes a Next.js frontend, an Express/TypeScript API, Clerk authentication, MongoDB persistence, provider connection flows, campaign workflows, an asset library, and an AI-assisted creative workflow.

> **Project status:** This repository contains active development code. A route, screen, or service being present does not by itself mean that the complete workflow has been tested against live provider accounts. Live functionality depends on valid provider credentials, app permissions, account access, and end-to-end verification.

---

## Contents

- [Product goals](#product-goals)
- [Current implementation](#current-implementation)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Environment configuration](#environment-configuration)
- [Run the application](#run-the-application)
- [API overview](#api-overview)
- [Provider-specific concepts](#provider-specific-concepts)
- [Data and asset storage](#data-and-asset-storage)
- [Security notes](#security-notes)
- [Project documentation](#project-documentation)
- [Development workflow](#development-workflow)
- [Roadmap](#roadmap)

---

## Product goals

The goal is to let a customer connect their own advertising accounts and work with them from one workspace.

### Initial advertising providers

- **Google Ads**
- **Meta Ads** — Facebook and Instagram advertising through Meta's Marketing API

The product should provide a consistent user experience without pretending the providers have identical campaign models or capabilities.

### Main product areas

- Provider account connections and account selection
- Unified dashboard and reporting
- Campaign creation and management
- Google ad groups and Meta ad sets
- Ad management
- Creative and asset library
- AI-assisted ad creative generation
- Audiences and targeting
- Conversion tracking
- Billing and account settings

Some areas are still under development. See [Current implementation](#current-implementation).

---

## Current implementation

The following reflects the source tree in this repository snapshot. It describes code that exists, not a guarantee that every provider operation is production-ready.

| Area | Present in this repository | Notes |
|---|---|---|
| Web application | Yes | Next.js App Router frontend |
| Authentication | Yes | Clerk integration in the frontend and Express API |
| Google Ads connection | Yes | OAuth routes and account discovery are present |
| Meta Ads connection | Yes | Meta authorization/callback and account discovery routes are present |
| Connection persistence | Yes | Provider connection helpers and MongoDB models are present |
| Campaign workflows | Yes | Shared campaign routes with provider-specific Google and Meta services |
| Ad workflows | Partially | Provider ad services and an ads router exist; the ads router is not currently mounted in `api/src/server.ts` |
| Asset library | Yes | Asset routes, MongoDB metadata, and local file storage |
| AI creative | Yes | Creative-generation route and service; provider configuration is required |
| Audiences | In progress | Frontend route exists; verify implementation before treating it as a complete feature |
| Conversions | In progress | Frontend route exists; verify implementation before treating it as a complete feature |
| Billing | In progress | Not a complete billing integration in this snapshot |
| Production readiness | Not established | Requires security review, provider testing, deployment configuration, and operational hardening |

### Important provider behavior

A shared dashboard can normalize common concepts such as name, objective, status, spend, and results. Provider-specific fields must remain provider-specific:

- Google Ads commonly uses **campaign → ad group → ad**.
- Meta Ads commonly uses **campaign → ad set → ad**.

Budget placement, bidding, objectives, targeting, creative formats, and reporting fields differ between platforms.

---

## Technology stack

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Material UI
- Clerk (`@clerk/nextjs`)
- Axios and native `fetch`

### Backend

- Node.js
- Express 5
- TypeScript
- Clerk (`@clerk/express`)
- MongoDB with Mongoose
- Google OAuth client libraries and Google APIs
- Meta Graph / Marketing API through provider services and HTTP requests
- Multer for upload handling

### AI and creative services

- Groq-compatible text generation configuration
- Pollinations-compatible image provider configuration
- NVIDIA integration configuration is also present in the API configuration

The active AI creative service reads its provider settings from environment variables. Availability and output depend on the configured provider and its current API terms/limits.

---

## Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                         AdSyntra Web                           │
│                  Next.js / React / TypeScript                  │
│                                                               │
│  Dashboard · Connections · Campaigns · Ads · Assets · AI      │
└───────────────────────────────┬───────────────────────────────┘
                                │
                    Clerk-authenticated requests
                                │
┌───────────────────────────────▼───────────────────────────────┐
│                         Express API                            │
│                    TypeScript / Node.js                        │
│                                                               │
│  Auth routes · Connections · Campaigns · Assets · AI Creative │
│                                                               │
│  Google Ads services                 Meta Ads services         │
└───────────────┬───────────────────────────────┬───────────────┘
                │                               │
       ┌────────▼────────┐             ┌────────▼────────┐
       │   Google Ads    │             │     Meta Ads    │
       │   OAuth / API   │             │  OAuth / Graph  │
       └─────────────────┘             └─────────────────┘
                                │
                       ┌────────▼────────┐
                       │     MongoDB     │
                       │ users, accounts,│
                       │ campaigns, assets│
                       └─────────────────┘
```

The frontend and API are separate applications and have separate package manifests.

---

## Repository structure

```text
adsAMagementPlatformAPI/
├── README.md
├── docs/
│   ├── ads-platform-database-erd.md
│   ├── provider-api-mapping.v26-review.md
│   ├── CAMPAIGN_PERSISTENCE.md
│   ├── unified_ads_platform_project_notes.md
│   ├── google-ads/
│   └── meta-ads/
│
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   └── src/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── layout.tsx
│       │   ├── dashboard/
│       │   │   ├── ads/
│       │   │   ├── assets/
│       │   │   ├── campaigns/
│       │   │   ├── ai-creation/
│       │   │   ├── audiences/
│       │   │   ├── conversions/
│       │   │   └── provider/
│       │   └── api/
│       └── lib/
│
└── api/
    ├── package.json
    └── src/
        ├── config/
        ├── googleadsAPI/
        │   └── services/
        ├── metaadsAPI/
        │   └── services/
        ├── models/
        ├── routes/
        ├── services/
        ├── types/
        ├── utils/
        └── server.ts
```

---

## Requirements

- Node.js **20.9 or later** recommended for the Next.js application
- npm
- MongoDB instance (local or hosted)
- Clerk application
- Google Cloud project with Google Ads API access for Google connection workflows
- Meta developer app with the required Marketing API / login configuration for Meta connection workflows
- AI provider credentials if you want to use AI creative generation

---

## Getting started

Clone or copy the repository, then install dependencies for each application separately.

### 1. Install frontend dependencies

```bash
cd frontend
npm install
```

### 2. Install API dependencies

Open another terminal:

```bash
cd api
npm install
```

### 3. Configure environment variables

Create local environment files:

```text
frontend/.env.local
api/.env
```

Use the variable names in the [Environment configuration](#environment-configuration) section. Never copy real credentials into source control.

### 4. Start MongoDB

Make sure the MongoDB instance configured by `MONGO_URI` is available before starting the API.

### 5. Start the API and frontend

Run the API and frontend in separate terminals. Commands are listed below.

---

## Environment configuration

The exact variables required depend on which provider and feature you are running. Do not put secrets in `NEXT_PUBLIC_*` variables; Next.js exposes those values to browser code.

### Frontend — `frontend/.env.local`

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_API_URL=http://localhost:5000
BACKEND_API_URL=http://localhost:5000
```

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publishable key used by the browser.
- `CLERK_SECRET_KEY`: Clerk secret key used by server-side Clerk functionality.
- `NEXT_PUBLIC_API_URL`: API base URL used by browser-side API helpers.
- `BACKEND_API_URL`: server-side API base URL where used by frontend server code.

### API — `api/.env`

```dotenv
# Server / application
CLERK_SECRET_KEY=
FRONTEND_URL=http://localhost:3000
SESSION_SECRET=
OAUTH_STATE_SECRET=
TOKEN_ENCRYPTION_KEY=
MONGO_URI=
MONGODB_DB_NAME=
ASSET_STORAGE_DIR=

# Google Ads OAuth and API
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_API_VERSION=

# Meta OAuth and Graph API
META_APP_ID=
META_APP_SECRET=
META_LOGIN_CONFIG_ID=
META_REDIRECT_URI=
META_GRAPH_API_VERSION=v26.0
META_ADS_API_VERSION=

# AI creative — text generation
GROQ_API_KEY=
GROQ_BASE_URL=
GROQ_TEXT_MODEL=

# AI creative — image generation
IMAGE_PROVIDER=pollinations
POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=
POLLINATIONS_MODEL=
POLLINATIONS_NOLOGO=
```

Additional optional variables may be used by scripts or specific integrations. Check the corresponding service/config file before enabling them.

#### Important configuration notes

- `TOKEN_ENCRYPTION_KEY` must be a **base64-encoded 32-byte key** for the provider-token encryption helper.
- `MONGO_URI` is required by the API's MongoDB connection setup.
- `META_REDIRECT_URI` must exactly match the callback URL configured in the Meta app.
- `GOOGLE_REDIRECT_URI` must match the redirect URI configured in Google Cloud.
- `FRONTEND_URL` is used by the Meta OAuth configuration and must be a valid URL.
- `ASSET_STORAGE_DIR` is optional. If omitted, uploaded files are stored under the API process working directory at `data/assets`.
- The current API server starts on port `5000` in `api/src/server.ts`. Update the server startup code if you want to make the port configurable.
- Do not commit `.env`, `.env.local`, access tokens, refresh tokens, encryption keys, app secrets, or downloaded customer data.

---

## Run the application

### Frontend

```bash
cd frontend

# Development
npm run dev

# Production build
npm run build

# Run production build
npm run start

# Lint
npm run lint
```

The frontend development server normally runs at:

```text
http://localhost:3000
```

### API

```bash
cd api

# Development server
npm run dev

# Type-check without emitting files
npm run typecheck

# Compile TypeScript
npm run build

# Run compiled server
npm run start
```

The API server currently listens at:

```text
http://localhost:5000
```

Health check:

```http
GET http://localhost:5000/health
```

---

## API overview

The Express server currently mounts these route groups in `api/src/server.ts`:

| Base path | Purpose |
|---|---|
| `/api/auth` | Google and Meta provider authorization, callbacks, and account discovery |
| `/api/connections` | Read connected accounts and select an advertising account |
| `/api/campaigns` | Campaign creation, listing, details, updates, status operations, and provider lookups |
| `/api/assets` | Asset library listing, upload, retrieval, update, and delete operations |
| `/api/ai-creative` | AI creative generation |

### Provider authorization endpoints

The provider auth router includes these route patterns:

```text
GET /api/auth/google
GET /api/auth/google/callback
GET /api/auth/google/accounts

GET /api/auth/meta
GET /api/auth/meta/callback
GET /api/auth/meta/accounts
```

### Connection endpoints

```text
GET  /api/connections/me
POST /api/connections/:provider/select-account
```

Supported provider keys in the connection route:

```text
googleAds
metaAds
```

### AI creative endpoint

```text
POST /api/ai-creative/generate
```

The request is authenticated and validated by the API route before the creative service is called.

### Ads router note

`api/src/routes/ads.routes.ts` exists and defines Google and Meta ad-listing endpoints. In this repository snapshot, it is **not imported or mounted by `api/src/server.ts`**. Add and verify the route mount before relying on those endpoints from the frontend.

---

## Provider-specific concepts

### Google Ads

Google Ads workflows may involve:

- Customer accounts and manager accounts
- Campaigns and campaign budgets
- Ad groups
- Ads and assets
- Campaign types and networks
- Bidding strategies
- Conversion actions
- GAQL reporting

The Google Ads customer ID and OAuth-authorized user access determine which account resources can be accessed.

### Meta Ads

Meta Ads workflows may involve:

- Ad accounts
- Campaigns
- Ad sets
- Ads and creatives
- Facebook Pages and Instagram identities
- Audiences and targeting
- Optimization and billing events
- Meta Pixel / conversion configuration
- Insights

Meta campaign objectives, budget strategy, placements, and creative requirements are not interchangeable with Google Ads settings.

### Unified product rule

Use a common interface for shared concepts, but retain provider-specific configuration and API payloads. For a Google + Meta operation, report each provider's result independently; do not assume the two provider operations form one atomic transaction.

---

## Data and asset storage

MongoDB is used for application records and provider-related data. The source includes models for users, provider connections, advertising accounts, campaigns, and assets.

The asset storage service writes uploaded image/video files to local disk by default:

```text
api/data/assets/
```

Set `ASSET_STORAGE_DIR` to an absolute path when deploying with a persistent volume. Local disk is not automatically shared between multiple API instances. A multi-instance production deployment should use shared object storage or another storage provider and should verify backup/retention behavior.

---

## Security notes

Before using this project with real customer accounts:

1. Keep provider access tokens and refresh tokens on the server.
2. Keep token-encryption keys and OAuth client secrets out of browser-visible variables.
3. Use HTTPS for deployed OAuth callback URLs.
4. Verify Clerk authentication and user ownership on every protected API operation.
5. Validate account IDs and resource IDs against the authenticated user's connected accounts.
6. Add audit logging for campaign and ad mutations.
7. Add idempotency, retries, and partial-failure handling for multi-provider operations.
8. Restrict upload size, MIME types, file access, and storage permissions.
9. Use a persistent, access-controlled storage provider for production assets.
10. Review Google and Meta app permissions, access levels, review requirements, and platform policies before launch.

The presence of authentication middleware or encrypted token helpers is not a substitute for a full security review.

---

## Project documentation

The `docs/` directory contains deeper design and provider-learning material. Useful starting points:

- `docs/unified_ads_platform_project_notes.md` — product direction, workflow decisions, and roadmap.
- `docs/ads-platform-database-erd.md` — database and entity relationship design.
- `docs/provider-api-mapping.v26-review.md` — provider API mapping notes.
- `docs/CAMPAIGN_PERSISTENCE.md` — campaign persistence notes.
- `docs/gogole-ads/` — Google Ads API learning notes and implementation references.
- `docs/meta-ads/` — Meta Marketing API learning documents and implementation references.

Some documents are learning/reference material and may describe earlier designs. Prefer the current source code and the project notes when checking what is implemented now.

---

## Development workflow

When adding a feature:

1. Check whether a provider-specific service or route already exists.
2. Reuse the existing Clerk authentication and connection/token utilities.
3. Keep provider API calls in provider-specific service modules.
4. Keep Express request/response handling in route modules.
5. Keep shared UI models separate from provider-specific request/response types.
6. Validate Google and Meta behavior independently.
7. Update this README or the relevant documentation when routes, environment variables, or setup steps change.

Avoid creating duplicate services or assuming that similarly named Google and Meta fields have identical semantics.

---

## Roadmap

The next product increments should be planned and verified against the current code:

- Complete and test the Google and Meta account connection journeys.
- Verify campaign create, list, detail, update, and status workflows with test accounts.
- Mount and test the ads router if its endpoints are intended for frontend use.
- Complete ad-level management and provider insights reporting.
- Finish audience and conversion workflows.
- Validate asset upload, preview, reuse, and persistent storage.
- Test AI creative generation and media-provider fallback behavior.
- Add unified reporting with clear provider-specific metric definitions.
- Complete security, error handling, observability, and deployment reviews.

---

## License

No project license is declared in the current repository snapshot. Add a `LICENSE` file before distributing the project as open source.
