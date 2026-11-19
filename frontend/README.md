# AdSyntra Frontend

The AdSyntra web application is built with **Next.js App Router**, **React**, **TypeScript**, **Tailwind CSS**, **Material UI**, and **Clerk**.

For the complete product overview, backend setup, environment variables, API route map, security notes, and roadmap, see the [root project README](../README.md).

## Requirements

- Node.js 20.9 or later
- npm
- A running AdSyntra API
- Clerk application keys

## Setup

```bash
npm install
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_API_URL=http://localhost:5000
BACKEND_API_URL=http://localhost:5000
```

Do not put provider secrets, database credentials, or other private keys in `NEXT_PUBLIC_*` variables.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Main application areas

- `/` — public landing page
- `/dashboard` — dashboard home
- `/dashboard/provider` — advertising account connections
- `/dashboard/campaigns` — campaign workflows
- `/dashboard/ads` — ad management
- `/dashboard/assets` — creative asset library
- `/dashboard/ai-creation` — AI-assisted creative workflow

Other dashboard navigation areas are present in the project but may still be under development.

## API requests

The shared API helper is in `src/lib/api.ts`. It sends the Clerk bearer token to the configured API base URL. Keep authenticated API requests server-validated; frontend checks alone are not authorization.

## Metadata

Global site metadata is configured in `src/app/layout.tsx`. The public landing page can override the default title and description in `src/app/page.tsx`. Set a verified production domain before adding canonical URLs or absolute social preview image URLs.
