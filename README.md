# FlowTech Hub

The internal company intranet for **FlowTech Apps** — find people, read company
news, manage documents, submit and approve requests, and see the company
calendar, all on top of the existing Microsoft 365 tenant.

> Strategy first. Systems that follow.

## Architecture

```
Browser (React SPA) ─► Node/Express BFF ─► Microsoft Graph (Entra, SharePoint, Outlook)
    │  httpOnly cookie     │            ─► Dataverse Web API (OData)
    │  (no tokens)         │            ─► Power Automate (HTTP flows)
    └──────────────────────┘
```

**Auth topology: Pure BFF session.** The browser holds **no tokens at all**.
The BFF runs the full **Authorization Code + PKCE** flow with `@azure/msal-node`,
keeps *all* tokens (access + refresh) in a server-side token cache, and issues
the browser only an opaque, `httpOnly`, `SameSite=strict` session cookie. React
calls same-origin `/api/*` with that cookie; the BFF acquires a Graph token
silently from the cache for each call. (This is the stronger reading of the
brief's "no tokens in browser / refresh tokens server-side only" requirement —
`@azure/msal-react` and the On-Behalf-Of flow are intentionally *not* used.)

Sign-in flow:

```
SPA → GET /auth/login → BFF redirects to Entra (PKCE) → user signs in
    → Entra → GET /auth/redirect → BFF exchanges code, caches tokens,
      sets ft_session cookie → redirects SPA → /api/me returns Graph profile
```

## Portals & access control (RBAC)

FlowTech Hub is one deployment with **two portals**:

- **Employee portal** (`/`) — the day-to-day Hub. Its navigation and pages adapt
  to the signed-in user's capabilities.
- **Admin portal** (`/admin`) — a visually distinct console (accent-tinted shell,
  "ADMIN" lockup) for managing roles, access, and content. Reached from the
  sidebar only by users with `admin.access`.

**Model (hybrid).** Access is a set of granular, per-feature **capabilities**
(e.g. `documents.upload`, `requests.approve`, `announcements.manage`). Capabilities
are bundled into named, editable **roles** (seeded: Employee, Manager,
Administrator). An admin assigns roles to employees under **People & Access**;
changes take effect on their next request (no re-login). Membership in the Entra
**admin group** (`ADMIN_GROUP_ID`) bootstraps a user as a full admin, so you can
never lock yourself out.

**Enforced in two places** — the BFF is authoritative (`requireCapability` on every
sensitive route → 403), and the client adapts the UI (`useCan`, `<RequireCap>`)
so users only see what they can use. Role/assignment/content stores are in-memory
in dev; TODO(prod): Dataverse (see `apps/api/src/auth/permissions.ts`,
`apps/api/src/store/content.ts`).

```
apps/api/src/auth/permissions.ts   capability catalog, roles, assignments, resolution
apps/api/src/routes/admin.ts       admin management API (capability-gated, zod-validated)
apps/web/src/pages/admin/*         Admin portal pages (Roles, People & Access, Announcements, Quick Links)
apps/web/src/hooks/useCan.ts       client capability checks
```

## Monorepo layout

```
/apps
  /web      React + Vite + TS · Tailwind · TanStack Query · React Router
  /api      Node + Express + TS (BFF) · msal-node · graph client · dataverse client
/packages
  /shared   Shared TS DTOs used by web + api
```

## Prerequisites

- Node.js 20+ and npm 9+
- (For live mode) a Microsoft 365 tenant + an Entra app registration — see
  [`SETUP.md`](./SETUP.md).

## Quick start (mock mode — no tenant required)

```bash
npm install
cp .env.example .env        # defaults are fine for mock mode
npm run dev                 # runs BFF (:4000) + web (:5173) together
```

Open http://localhost:5173. Because `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` are
unset, the BFF runs in **MOCK mode** and serves seed data, so the entire UI is
demoable before the tenant is wired. The BFF logs a `MOCK` banner on boot.

## Scripts

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Web + API together (concurrently)                   |
| `npm run dev:web`    | Vite dev server only (`:5173`)                      |
| `npm run dev:api`    | BFF only (`:4000`, tsx watch)                       |
| `npm run build`      | Build shared → api → web                             |
| `npm run lint`       | ESLint across the repo                              |
| `npm run test`       | Vitest (web + api)                                  |
| `npm run format`     | Prettier write                                      |

## Health

- `GET /healthz` → `{ status, mode, uptime }` (mode is `mock` or `live`).

## Build order (phased)

This repo is built in sequence with a review pause after each step:

1. **Scaffold** — monorepo, tooling, Tailwind, brand tokens, app shell (mock user). ✅
2. **Auth** — Entra SSO end-to-end (Pure BFF session → `/api/me` Graph profile). ✅
3. **Directory + Documents** — real Graph directory (search, org chart, photos) +
   SharePoint library (browse, upload, download, search). ✅
4. **Calendar + Dashboard** — Outlook `calendarView` (month/week, personal +
   shared company calendar), event detail; dashboard widgets. ✅
5. **Requests & approvals** — submit (Dataverse), Power Automate approval flow +
   secret-authenticated status callback, in-app approve/reject. ✅
6. **Announcements, notifications, assets, admin** — admin portal + announcements,
   notifications center (unread badge, fed by approval outcomes), editable asset
   tracker. ✅ _current_
7. **Harden** — CSP/HSTS + auth rate limiting, single-origin SPA serving,
   Dockerfile, [`DEPLOYMENT.md`](./DEPLOYMENT.md). ✅ _current_

## Brand tokens

Matched to the L+M client-portal design (light, teal-accented) and encoded as
Tailwind theme tokens + CSS variables in
[`apps/web/tailwind.config.ts`](apps/web/tailwind.config.ts) and
[`apps/web/src/index.css`](apps/web/src/index.css). **Light is the default**; a
dark counterpart is available via the user menu (persisted in `localStorage`).

| Token           | Light     | Dark      | Use                    |
| --------------- | --------- | --------- | ---------------------- |
| `ink`           | `#F1F4F5` | `#0F171A` | Page background        |
| `surface`       | `#FFFFFF` | `#162326` | Cards                  |
| `content`       | `#1A2A2F` | `#E6EDEE` | Primary text           |
| `muted`         | `#5E6D72` | `#93A3A7` | Secondary text         |
| `accent`        | `#0F7C8A` | `#1BA3B2` | Teal primary           |
| `accent.bright` | `#0A6672` | `#33C2D0` | Hover / links          |

Status accents (`success`/`warning`/`danger`) map to the portal's
green / amber / red. Font: **Inter** (self-hosted, SIL OFL — no external CDN).

## Security posture (see also `SETUP.md`)

- **No tokens in the browser** — all tokens live in the BFF's server-side msal
  token cache; the browser gets only an opaque `httpOnly`, `SameSite=strict`
  session cookie (`ft_session`).
- **CSRF** — double-submit token: the BFF sets a readable `ft_csrf` cookie; the
  SPA echoes it in `x-csrf-token` on writes, checked on every mutating `/api` route.
- **PKCE** — the OAuth handshake uses a transient `SameSite=lax` cookie (`ft_oauth`)
  to carry the PKCE verifier + state across the Entra round-trip (strict would
  drop it on the cross-site return navigation).
- `helmet`, CORS locked to the web origin with credentials, per-IP rate limiting on `/api`.
- Graph 429/503 throttling handled by the SDK's retry middleware (honors `Retry-After`).
- Request validation with `zod`; typed API error envelopes with request IDs.
- Secrets live only in the root `.env` (never committed; `.env.example` is the template).

> The in-memory session store and msal token cache mean a BFF restart signs
> users out. TODO(prod): back both with Redis (or an encrypted cookie store) —
> see `apps/api/src/auth/session.ts` and `apps/api/src/auth/msal.ts`.
