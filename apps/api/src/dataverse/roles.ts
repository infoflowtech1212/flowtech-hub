import type { Capability, Role } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { ALL_CAPABILITIES, ADMIN_ROLE_ID, seedRoles } from '../auth/capabilities.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for Roles + Role Assignments — the admin RBAC
 * surface (Roles page, People & Access). Two tables:
 *  - Roles: role definitions (name, description, capabilities).
 *  - Role Assignments: one row per user, comma-separated role keys.
 *
 * IMPORTANT: `id` on the returned Role is the STABLE business key
 * ("role-employee", "role-admin", or a generated slug for custom roles) —
 * NOT the Dataverse row GUID. Auth logic elsewhere hardcodes comparisons
 * against those two ids (see auth/capabilities.ts), so this key must never
 * change once assigned. The Dataverse GUID is used only internally, to
 * address rows for PATCH/DELETE.
 *
 * The two system roles (Employee, Administrator) are auto-created if
 * missing on first read, using the same seed data as the in-memory
 * fallback, so a freshly created table doesn't need manual seeding.
 *
 * This data also backs the hot path (every authenticated request resolves
 * capabilities — see auth/middleware.ts), which must stay fast, so it is
 * NOT read from Dataverse per-request. Instead, auth/permissions.ts hydrates
 * its in-memory cache from here once at boot, and every admin write here is
 * mirrored into that cache immediately (see routes/admin.ts) so role changes
 * still take effect without a restart, while a restart now recovers the last
 * persisted state instead of resetting to the hardcoded seed.
 *
 * Enabled only when DATAVERSE_ROLE_TABLE is set; otherwise the app uses the
 * built-in in-memory store, which is lost on every redeploy. When enabled,
 * DATAVERSE_ROLEASSIGNMENT_TABLE must also be set for assignments to persist.
 */
// Defaults below match the live `ft_userroles` table (Power Platform admin
// center → FlowTech - L+M Asset Transitions → Tables → User Role → Columns).
const TABLE = process.env.DATAVERSE_ROLE_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_ROLE_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_ROLE_ID_COL || `${P}userroleid`;
const ROLEKEY_COL = process.env.DATAVERSE_ROLE_ROLEKEY_COL || `${P}roleidentifier`;
const NAME_COL = process.env.DATAVERSE_ROLE_NAME_COL || `${P}rolename`;
const DESCRIPTION_COL = process.env.DATAVERSE_ROLE_DESCRIPTION_COL || `${P}roledescription`;
const CAPABILITIES_COL = process.env.DATAVERSE_ROLE_CAPABILITIES_COL || `${P}rolecapabilities`;
const SYSTEM_COL = process.env.DATAVERSE_ROLE_SYSTEM_COL || `${P}systemroleflag`;

// Defaults below match the live `ft_userroleassignments` table (Power
// Platform admin center → FlowTech - L+M Asset Transitions → Tables →
// User Role Assignment → Columns).
const ASSIGNMENT_TABLE = process.env.DATAVERSE_ROLEASSIGNMENT_TABLE || '';
const AP = process.env.DATAVERSE_ROLEASSIGNMENT_PREFIX || 'ft_';
const A_ID_COL = process.env.DATAVERSE_ROLEASSIGNMENT_ID_COL || `${AP}userroleassignmentid`;
const A_USERID_COL = process.env.DATAVERSE_ROLEASSIGNMENT_USERID_COL || `${AP}useridentifier`;
const A_ROLEIDS_COL = process.env.DATAVERSE_ROLEASSIGNMENT_ROLEIDS_COL || `${AP}assignedrole`;

export const rolesDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, ROLEKEY_COL, NAME_COL, DESCRIPTION_COL, CAPABILITIES_COL, SYSTEM_COL].join(',')}`;

const toDto = (r: DvRow): Role => ({
  id: r[ROLEKEY_COL] as string,
  name: (r[NAME_COL] as string) ?? '',
  description: (r[DESCRIPTION_COL] as string | null) ?? undefined,
  capabilities: ((r[CAPABILITIES_COL] as string | null) || '').split(',').filter(Boolean) as Capability[],
  system: Boolean(r[SYSTEM_COL]),
});

async function findRowByKey(roleKey: string): Promise<DvRow | undefined> {
  const url = `/${TABLE}?${SELECT}&$filter=${ROLEKEY_COL} eq '${roleKey}'&$top=1`;
  const { data } = await client().get(url);
  return (data.value as DvRow[])[0];
}

/** Creates whichever of the two system roles aren't present yet. */
async function ensureSystemRoles(existing: DvRow[]): Promise<DvRow[]> {
  const haveKeys = new Set(existing.map((r) => r[ROLEKEY_COL] as string));
  const missing = seedRoles().filter((r) => r.system && !haveKeys.has(r.id));
  if (!missing.length) return existing;
  const created: DvRow[] = [];
  for (const role of missing) {
    const row: Record<string, unknown> = {
      [ROLEKEY_COL]: role.id,
      [NAME_COL]: role.name,
      [DESCRIPTION_COL]: role.description,
      [CAPABILITIES_COL]: role.capabilities.join(','),
      [SYSTEM_COL]: true,
    };
    const { data } = await client().post(`/${TABLE}`, row);
    created.push(data as DvRow);
  }
  return [...existing, ...created];
}

export async function dvListRoles(): Promise<Role[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}`);
  const rows = await ensureSystemRoles(data.value as DvRow[]);
  return rows.map(toDto);
}

export async function dvCreateRole(
  id: string,
  input: { name: string; description?: string; capabilities: Capability[] },
): Promise<Role> {
  const row: Record<string, unknown> = {
    [ROLEKEY_COL]: id,
    [NAME_COL]: input.name,
    [DESCRIPTION_COL]: input.description,
    [CAPABILITIES_COL]: input.capabilities.filter((c) => ALL_CAPABILITIES.includes(c)).join(','),
    [SYSTEM_COL]: false,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

export async function dvUpdateRole(
  id: string,
  patch: Partial<Pick<Role, 'name' | 'description' | 'capabilities'>>,
): Promise<Role | undefined> {
  const existing = await findRowByKey(id);
  if (!existing) return undefined;
  const isSystem = Boolean(existing[SYSTEM_COL]);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined && !isSystem) row[NAME_COL] = patch.name;
  if (patch.description !== undefined) row[DESCRIPTION_COL] = patch.description;
  if (patch.capabilities) {
    const caps = patch.capabilities.filter((c) => ALL_CAPABILITIES.includes(c));
    // Guard: the Administrator role must always keep admin.access.
    const guarded = id === ADMIN_ROLE_ID && !caps.includes('admin.access') ? [...caps, 'admin.access'] : caps;
    row[CAPABILITIES_COL] = guarded.join(',');
  }
  const { data } = await client().patch(`/${TABLE}(${existing[ID_COL]})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteRole(id: string): Promise<boolean> {
  const existing = await findRowByKey(id);
  if (!existing || existing[SYSTEM_COL]) return false; // not found, or system roles are protected
  await client().delete(`/${TABLE}(${existing[ID_COL]})`);
  await dvRemoveRoleFromAllAssignments(id);
  return true;
}

// --- Assignments -------------------------------------------------------------
const A_SELECT = `$select=${[A_ID_COL, A_USERID_COL, A_ROLEIDS_COL].join(',')}`;

async function findAssignmentRow(userId: string): Promise<DvRow | undefined> {
  const url = `/${ASSIGNMENT_TABLE}?${A_SELECT}&$filter=${A_USERID_COL} eq '${userId}'&$top=1`;
  const { data } = await client().get(url);
  return (data.value as DvRow[])[0];
}

export async function dvGetAssignedRoleIds(userId: string): Promise<string[]> {
  const row = await findAssignmentRow(userId);
  return ((row?.[A_ROLEIDS_COL] as string | undefined) || '').split(',').filter(Boolean);
}

/** userId -> roleIds, for hydrating the in-memory cache at boot / batch reads. */
export async function dvListAllAssignments(): Promise<Map<string, string[]>> {
  const { data } = await client().get(`/${ASSIGNMENT_TABLE}?${A_SELECT}`);
  const map = new Map<string, string[]>();
  for (const row of data.value as DvRow[]) {
    const userId = row[A_USERID_COL] as string;
    map.set(userId, ((row[A_ROLEIDS_COL] as string | null) || '').split(',').filter(Boolean));
  }
  return map;
}

export async function dvSetAssignedRoleIds(userId: string, roleIds: string[]): Promise<string[]> {
  const roles = await dvListRoles();
  const valid = roleIds.filter((id) => roles.some((r) => r.id === id));
  const existing = await findAssignmentRow(userId);
  const row = { [A_ROLEIDS_COL]: valid.join(',') };
  if (existing) {
    await client().patch(`/${ASSIGNMENT_TABLE}(${existing[A_ID_COL]})`, row);
  } else {
    await client().post(`/${ASSIGNMENT_TABLE}`, { [A_USERID_COL]: userId, ...row });
  }
  return valid;
}

async function dvRemoveRoleFromAllAssignments(roleId: string): Promise<void> {
  const all = await dvListAllAssignments();
  for (const [userId, roleIds] of all) {
    if (!roleIds.includes(roleId)) continue;
    await dvSetAssignedRoleIds(userId, roleIds.filter((r) => r !== roleId));
  }
}
