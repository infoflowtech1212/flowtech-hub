import type { Capability } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { ALL_CAPABILITIES } from '../auth/capabilities.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for per-user capability grants — additive
 * capabilities layered on top of role capabilities (currently only used for
 * Document Access: documents.share, clientdocs.view/manage; see
 * DOC_ACCESS_CAPS in routes/admin.ts). One row per user.
 *
 * This data is read on every authenticated request (RBAC check, see
 * resolveCapabilities() in auth/permissions.ts), so — same as
 * dataverse/roles.ts — it is NOT queried from Dataverse per-request.
 * auth/permissions.ts hydrates its in-memory cache from here once at boot,
 * and routes/admin.ts mirrors every admin write here too, so a grant still
 * takes effect immediately in the current process.
 *
 * Enabled only when DATAVERSE_GRANT_TABLE is set; otherwise the app uses the
 * built-in in-memory store, which is lost on every redeploy.
 */
// Defaults below match the live `ft_grantses` table (Power Platform admin
// center → FlowTech - L+M Asset Transitions → Tables → Grants → Columns).
const TABLE = process.env.DATAVERSE_GRANT_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_GRANT_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_GRANT_ID_COL || `${P}grantsid`;
const USERID_COL = process.env.DATAVERSE_GRANT_USERID_COL || `${P}useridentifier`;
const CAPABILITIES_COL = process.env.DATAVERSE_GRANT_CAPABILITIES_COL || `${P}usercapabilities`;

export const grantsDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, USERID_COL, CAPABILITIES_COL].join(',')}`;

const parseCaps = (v: unknown): Capability[] =>
  ((v as string | null) || '').split(',').filter(Boolean) as Capability[];

async function findRow(userId: string): Promise<DvRow | undefined> {
  const url = `/${TABLE}?${SELECT}&$filter=${USERID_COL} eq '${userId}'&$top=1`;
  const { data } = await client().get(url);
  return (data.value as DvRow[])[0];
}

export async function dvGetUserGrants(userId: string): Promise<Capability[]> {
  const row = await findRow(userId);
  return row ? parseCaps(row[CAPABILITIES_COL]) : [];
}

/** userId -> capabilities, for hydrating the in-memory cache at boot / batch reads. */
export async function dvListAllGrants(): Promise<Map<string, Capability[]>> {
  const { data } = await client().get(`/${TABLE}?${SELECT}`);
  const map = new Map<string, Capability[]>();
  for (const row of data.value as DvRow[]) {
    map.set(row[USERID_COL] as string, parseCaps(row[CAPABILITIES_COL]));
  }
  return map;
}

export async function dvSetUserGrants(userId: string, caps: Capability[]): Promise<Capability[]> {
  const valid = caps.filter((c) => ALL_CAPABILITIES.includes(c));
  const existing = await findRow(userId);
  const row = { [CAPABILITIES_COL]: valid.join(',') };
  if (existing) {
    await client().patch(`/${TABLE}(${existing[ID_COL]})`, row);
  } else {
    await client().post(`/${TABLE}`, { [USERID_COL]: userId, ...row });
  }
  return valid;
}
