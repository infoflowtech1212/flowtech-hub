# FlowTech Hub — Microsoft tenant setup

This checklist is what an **admin** configures in the Azure / Microsoft 365
tenant. You do the portal clicks; the app consumes the resulting values via the
root `.env` (template: [`.env.example`](./.env.example)). Nothing here is needed
for **mock mode** — it applies when wiring auth (Build Order step 2) onward.

> Anything the code can't discover on its own is marked **TODO: fill in .env**.
> Where a permission needs tenant-admin consent, it's flagged **[admin consent]**.

---

## 1. Entra ID (Azure AD) app registration

Entra admin center → **App registrations → New registration**.

> **Topology note:** the Hub uses the **Pure BFF session** pattern — the browser
> never runs MSAL and holds no tokens. So you only need a **Web** redirect for
> the confidential-client BFF; there is **no SPA redirect** and **no "Expose an
> API" scope** to configure (those belong to the msal-react/OBO alternative we
> did not take).

1. **Name:** `FlowTech Hub`.
2. **Supported account types:** Single tenant (this organization only).
3. **Redirect URI** — add **one** platform:
   - **Web** → `http://localhost:4000/auth/redirect` (dev) and your prod BFF
     redirect (e.g. `https://hub.flowtechapps.com/auth/redirect`). This is where
     Entra returns the auth code to the confidential-client BFF.
     → keep in sync with **.env** `REDIRECT_URI`.
4. **Certificates & secrets** → **New client secret**. Copy the value once.
   → **TODO: fill in .env** `AZURE_CLIENT_SECRET` (server-side only — never in the web bundle)
5. From **Overview**, copy:
   → **TODO: fill in .env** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`

## 2. Microsoft Graph — delegated permissions

App registration → **API permissions → Add → Microsoft Graph → Delegated**.

| Permission               | Purpose                              | Admin consent?    |
| ------------------------ | ------------------------------------ | ----------------- |
| `openid`, `profile`, `email` | OIDC sign-in                     | No                |
| `offline_access`         | Refresh tokens (server-side)         | No                |
| `User.Read`              | Signed-in user's profile + photo     | No                |
| `User.ReadBasic.All`     | Employee directory                   | **[admin consent]** |
| `Calendars.Read`         | Read Outlook + company calendar      | No                |
| `Calendars.ReadWrite`    | _Only if_ creating events / RSVP     | No                |
| `Files.ReadWrite.All` **or** `Sites.ReadWrite.All` | SharePoint document library | **[admin consent]** |

After adding, click **Grant admin consent for <tenant>** for the flagged ones.
The requested delegated scopes are set in `.env` (`GRAPH_SCOPES`); keep them
least-privilege.

## 3. Dataverse (structured data — announcements, requests, assets)

Used from Build Order step 5+.

1. Power Platform admin center → your environment → note the **Environment URL**.
   → **TODO: fill in .env** `DATAVERSE_URL=https://<org>.crm.dynamics.com`
   → `DATAVERSE_SCOPE=https://<org>.crm.dynamics.com/.default`
2. Create an **application user** for the app registration (Settings → Users +
   permissions → Application users → New), and assign a **security role** that
   grants access to the tables the Hub uses (announcements, requests, assets).
3. The BFF requests the Dataverse token via On-Behalf-Of using the app scope.
4. **Requests table** — create a table `flowtech_request` (entity set
   `flowtech_requests`) with these columns (the code in
   `apps/api/src/dataverse/requests.ts` maps to these logical names — adjust the
   `flowtech_` prefix to match your publisher):

   | Column (logical name)    | Type            | Notes                          |
   | ------------------------ | --------------- | ------------------------------ |
   | `flowtech_type`          | Choice/Text     | `leave` / `expense` / `document` |
   | `flowtech_title`         | Text            |                                |
   | `flowtech_description`   | Multiline text  |                                |
   | `flowtech_status`        | Choice (int)    | 1 draft · 2 pending · 3 approved · 4 rejected · 5 cancelled |
   | `flowtech_requesterid`   | Text            | Entra oid                      |
   | `flowtech_requestername` | Text            |                                |
   | `flowtech_approvername`  | Text            |                                |
   | `flowtech_amount`        | Decimal         | expenses                       |
   | `flowtech_startdate`     | DateTime        | leave                          |
   | `flowtech_enddate`       | DateTime        | leave                          |

   `createdon` / `modifiedon` are system columns. Announcements and assets tables
   follow later; for now they persist in-memory in the BFF.

## 4. SharePoint (document center)

1. Identify the target **site** and **document library** for Hub documents,
   e.g. site `https://<tenant>.sharepoint.com/sites/FlowTechHub`, library
   `Documents`.
   → **TODO: fill in .env** `SHAREPOINT_HOSTNAME`, `SHAREPOINT_SITE_PATH`, `SHAREPOINT_LIBRARY_NAME`
2. The BFF resolves the **site ID** and **drive ID** by name via Graph
   (`/sites/{hostname}:{path}` → `/drives`) and **caches** them server-side, so
   you don't paste raw IDs. Permissions are still enforced by SharePoint per user.

## 5. Power Automate (notifications & approvals)

Create two **HTTP-triggered** flows ("When an HTTP request is received"):

1. **`notify`** — accepts `{ title, body, audience }`, posts a Teams/email
   message. Copy its trigger URL.
   → **TODO: fill in .env** `FLOW_NOTIFY_URL` (server-side only)
2. **`approval`** — accepts the request payload the BFF POSTs (`requestId`,
   `type`, `title`, `requesterName`, `callbackUrl`, `callbackSecret`, …), starts
   an approval (Teams/email adaptive card), and on completion **calls back** the
   BFF. Copy its trigger URL.
   → **TODO: fill in .env** `FLOW_APPROVAL_URL` (server-side only)

   The callback: the flow does an **HTTP POST** to the `callbackUrl` it received,
   with header `x-flow-secret: <callbackSecret>` and body
   `{ requestId, decision: "approved"|"rejected", approverName }`. The BFF endpoint
   is `POST /flows/approval-callback` (outside the session-gated API; authenticated
   solely by the secret).
   → **TODO: fill in .env** `FLOW_CALLBACK_SECRET` (a long random string; the BFF
   rejects callbacks unless it's set and matches)

> Flow trigger URLs contain a signature — treat them as secrets. They live only
> in the BFF's `.env` and are never exposed to the browser.

## 6. Admin role gating

1. Create an Entra **security group**, e.g. `FlowTech Hub Admins`, and add
   admins. Copy its **object ID**.
   → **TODO: fill in .env** `ADMIN_GROUP_ID`
2. The BFF maps membership in this group to the `admin` app role in `/api/me`;
   the Admin panel and admin-only endpoints are gated on it.

---

## Values you must paste into `.env`

| `.env` key                | Source                                            |
| ------------------------- | ------------------------------------------------- |
| `AZURE_TENANT_ID`         | App registration → Overview                       |
| `AZURE_CLIENT_ID`         | App registration → Overview                       |
| `AZURE_CLIENT_SECRET`     | App registration → Certificates & secrets         |
| `REDIRECT_URI`            | Must match the Web redirect URI you registered    |
| `SHAREPOINT_*`            | Target site + library                             |
| `DATAVERSE_URL` / `_SCOPE`| Power Platform environment                        |
| `FLOW_NOTIFY_URL`         | Power Automate `notify` flow trigger              |
| `FLOW_APPROVAL_URL`       | Power Automate `approval` flow trigger            |
| `ADMIN_GROUP_ID`          | Entra security group object ID                    |

Fill these, restart the BFF, and it flips from **MOCK** to **LIVE** automatically
(it keys off `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`).
