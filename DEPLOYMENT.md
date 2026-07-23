# FlowTech Hub — deployment

This covers taking the Hub from the local mock build to a hosted, tenant-wired
deployment on Azure. Read [`SETUP.md`](./SETUP.md) first for the Entra / Graph /
Dataverse / Power Automate configuration; this doc covers hosting.

## The one hard constraint: single origin

The session is a **`SameSite=strict`, `httpOnly` cookie**. For it to flow, the
SPA, `/api`, and `/auth` must be served from the **same origin** (same scheme +
host + port). Two supported topologies satisfy this:

### Topology A — single-origin container (recommended, simplest)

The BFF serves the built SPA itself (`SERVE_WEB=true`). One deployable unit,
one origin, nothing to coordinate.

- Build the image from the repo root:
  ```bash
  docker build -f apps/api/Dockerfile -t flowtech-hub .
  docker run -p 4000:4000 --env-file .env flowtech-hub
  ```
  The image sets `NODE_ENV=production`, `SERVE_WEB=true`, `WEB_DIST=/repo/apps/web/dist`.
- Host on **Azure App Service (Linux container)** or **Azure Container Apps**.
  - App Service injects `PORT`; either set `API_PORT` to match, or add a tiny
    shim — the app reads `API_PORT` (default 4000). Set `API_PORT=8080` and
    `WEBSITES_PORT=8080` on App Service.
  - Set every value from `.env` as **App Settings** (never bake secrets into the image).
- Set the Entra **Web redirect URI** to `https://<your-host>/auth/redirect` and
  `WEB_ORIGIN`/`POST_LOGOUT_REDIRECT_URI` to `https://<your-host>`.

### Topology B — Static Web App + separate API, behind one origin

Host the SPA on **Azure Static Web Apps** and the BFF on **App Service**, then
put both behind **one** front door so the browser sees a single origin:

- Azure Static Web Apps has a built-in **linked backend / API** that proxies
  `/api` (and here also `/auth`) to your App Service under the SWA's own domain —
  use that so cookies stay first-party. Configure route proxying in
  `staticwebapp.config.json` for `/api/*` and `/auth/*`.
- Alternatively front both with **Azure Front Door / Application Gateway**: route
  `/api/*` and `/auth/*` to the BFF, everything else to the SPA's static host.
- In this topology run the BFF with `SERVE_WEB=false`.

> Do **not** deploy the SPA and BFF on two different public origins without a
> shared front door — the strict cookie won't be sent and sign-in will loop.

## Build & run

```bash
npm install
npm run build           # shared → api → web
# single-origin run:
NODE_ENV=production SERVE_WEB=true WEB_DIST="$(pwd)/apps/web/dist" \
  node apps/api/dist/index.js
```

`GET /healthz` → `{ status, mode, uptime }` (`mode` flips to `live` once
`AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` are set). Wire it as the host's health probe.

## Environment (App Settings)

Everything in [`.env.example`](./.env.example). Minimum to go live:

| Key | Notes |
| --- | --- |
| `NODE_ENV=production` | enables HSTS, disables dev logging |
| `SESSION_SECRET` | 32+ random chars |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | app registration |
| `REDIRECT_URI` | `https://<host>/auth/redirect` (must match Entra) |
| `WEB_ORIGIN` / `POST_LOGOUT_REDIRECT_URI` | `https://<host>` |
| `GRAPH_SCOPES` | delegated scopes (least privilege) |
| `SHAREPOINT_*` | document library |
| `COMPANY_CALENDAR_MAILBOX` | optional shared calendar |
| `DATAVERSE_URL` / `DATAVERSE_SCOPE` | requests persistence |
| `FLOW_NOTIFY_URL` / `FLOW_APPROVAL_URL` / `FLOW_CALLBACK_SECRET` | Power Automate |
| `ADMIN_GROUP_ID` | bootstrap admins |

## Security posture (verify before go-live)

- ✅ No tokens in the browser (BFF holds them server-side).
- ✅ `helmet` with an explicit **CSP**, **HSTS** (prod), `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy`, `x-powered-by` disabled.
- ✅ **CSRF** double-submit on every mutating `/api` route; **rate limiting** on
  `/api` (120/min) and a tighter limit on `/auth` (20/min).
- ✅ Capability checks (`requireCapability`) on every sensitive route — the BFF is
  the authority, not the client.
- ✅ **CSP is fully self-hosted** — Onest (SIL OFL) is bundled under
  `apps/web/public/fonts`, so the CSP allows **no external origins** for scripts,
  styles, fonts, or connections (`default-src 'self'`).
- ⚠️ **Persistence:** roles/assignments, announcements, quick links, requests,
  notifications, and assets are **in-memory** (reset on restart) until wired to
  Dataverse. This is the main pre-production task — see the `TODO(prod)` markers
  in `apps/api/src/auth/permissions.ts`, `store/*.ts`, and `dataverse/requests.ts`.
  Also swap the msal token cache + session store for Redis so restarts/scale-out
  don't sign everyone out (`apps/api/src/auth/msal.ts`, `auth/session.ts`).

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds shared, lints,
tests, and builds on every push/PR. Add a deploy job (container build + push to
ACR, or SWA deploy) once the target subscription is chosen.
