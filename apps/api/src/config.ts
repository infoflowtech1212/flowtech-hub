import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the root .env (monorepo has a single env file at the repo root). Skip in
// tests (Vitest sets NODE_ENV=test) so unit tests always run in MOCK mode
// regardless of any real credentials in .env.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  // Most PaaS hosts (App Service, Container Apps, Render, Railway, Fly) inject
  // the port to listen on via PORT — honour it, falling back to API_PORT then 4000.
  port: num(process.env.PORT ?? process.env.API_PORT, 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-insecure-session-secret',

  // Single-origin deployment: when true (default in prod), the BFF also serves
  // the built SPA from WEB_DIST, so /api, /auth and the app share one origin —
  // which the strict session cookie requires. Set false to host the SPA
  // separately (e.g. Azure Static Web Apps) behind a shared reverse proxy.
  serveWeb: (process.env.SERVE_WEB ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',
  webDist: process.env.WEB_DIST ?? '',

  azure: {
    tenantId: process.env.AZURE_TENANT_ID ?? '',
    clientId: process.env.AZURE_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
    apiScope: process.env.API_SCOPE ?? '',
    redirectUri: process.env.REDIRECT_URI ?? 'http://localhost:4000/auth/redirect',
    postLogoutRedirectUri: process.env.POST_LOGOUT_REDIRECT_URI ?? 'http://localhost:5173',
  },

  graph: {
    baseUrl: process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0',
    scopes: (process.env.GRAPH_SCOPES ?? 'User.Read').split(/\s+/).filter(Boolean),
  },

  sharepoint: {
    hostname: process.env.SHAREPOINT_HOSTNAME ?? '',
    sitePath: process.env.SHAREPOINT_SITE_PATH ?? '',
    libraryName: process.env.SHAREPOINT_LIBRARY_NAME ?? 'Documents',
  },

  calendar: {
    // Shared company calendar source: a room/shared mailbox UPN or user id whose
    // calendar everyone sees alongside their own. Empty = personal events only.
    companyMailbox: process.env.COMPANY_CALENDAR_MAILBOX ?? '',
  },

  dataverse: {
    url: process.env.DATAVERSE_URL ?? '',
    scope: process.env.DATAVERSE_SCOPE ?? '',
  },

  flows: {
    notifyUrl: process.env.FLOW_NOTIFY_URL ?? '',
    approvalUrl: process.env.FLOW_APPROVAL_URL ?? '',
    // Vault flow: writes the credential to Dataverse and (for shared entries)
    // notifies all employees.
    vaultUrl: process.env.FLOW_VAULT_URL ?? '',
    // Shared secret the approval flow presents when calling back with an outcome.
    callbackSecret: process.env.FLOW_CALLBACK_SECRET ?? '',
  },

  adminGroupId: process.env.ADMIN_GROUP_ID ?? '',
  // Bootstrap admins by email (UPN) — the reliable way to grant the first admin
  // before an Entra admin group is wired. Comma-separated, case-insensitive.
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // Only these email domains may sign in (blocks guests / other tenants).
  // Empty = allow any authenticated account.
  allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

/**
 * When the tenant isn't wired yet (no client id/secret), the BFF serves mock
 * data so the whole UI is demoable. Auth wiring in Build Order step 2 flips
 * this off by populating the Azure env vars.
 */
export const USE_MOCKS = !config.azure.clientId || !config.azure.clientSecret;
