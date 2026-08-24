import { randomUUID } from 'node:crypto';
import type { Capability, Role } from '@flowtech/shared';
import { ALL_CAPABILITIES, ADMIN_ROLE_ID, DEFAULT_ROLE_ID, seedRoles } from './capabilities.js';
import { dvListAllAssignments, dvListRoles, rolesDataverseEnabled } from '../dataverse/roles.js';
import { dvListAllGrants, grantsDataverseEnabled } from '../dataverse/grants.js';

export { CAPABILITY_CATALOG, ALL_CAPABILITIES, DEFAULT_ROLE_ID, ADMIN_ROLE_ID } from './capabilities.js';

/**
 * Authorization catalog + store.
 *
 * Model (hybrid): membership in the Entra ADMIN_GROUP_ID bootstraps a user as a
 * root admin (they always get every capability — you can't lock yourself out).
 * Everyone else's access is the union of the capabilities of the app-managed
 * roles assigned to them here.
 *
 * Persistence: `roleStore`/`assignmentStore` below are also the hot-path cache
 * that every authenticated request reads via resolveCapabilities() (see
 * auth/middleware.ts), so they stay in-memory and synchronous even when
 * Dataverse is configured — Dataverse per-request would add real latency to
 * every request just to check permissions. Instead: dataverse/roles.ts is the
 * durable source of truth, hydrateRolesFromDataverse() loads it into this
 * cache once at boot, and routes/admin.ts mirrors every admin write here too
 * (via createRole/replaceRoleInStore/deleteRole/setAssignedRoleIds) so a
 * change still takes effect immediately in the current process, exactly as it
 * did when this was purely in-memory.
 */

// In-memory stores — hot-path cache for resolveCapabilities(), and the
// complete store when Dataverse isn't configured.
let roleStore: Role[] = seedRoles();
const assignmentStore = new Map<string, string[]>();
// Per-user capability grants layered ON TOP of roles (e.g. document access
// control). userId -> extra capabilities. TODO(prod): Dataverse.
const grantStore = new Map<string, Capability[]>();

// --- Role CRUD -------------------------------------------------------------
export const listRoles = (): Role[] => roleStore.map((r) => ({ ...r }));
export const getRole = (id: string): Role | undefined => roleStore.find((r) => r.id === id);

export function createRole(
  input: { name: string; description?: string; capabilities: Capability[] },
  forcedId?: string,
): Role {
  const role: Role = {
    id: forcedId ?? `role-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`,
    name: input.name,
    description: input.description,
    capabilities: input.capabilities.filter((c) => ALL_CAPABILITIES.includes(c)),
    system: false,
  };
  roleStore.push(role);
  return role;
}

export function updateRole(id: string, patch: Partial<Pick<Role, 'name' | 'description' | 'capabilities'>>): Role | undefined {
  const role = roleStore.find((r) => r.id === id);
  if (!role) return undefined;
  if (patch.name !== undefined && !role.system) role.name = patch.name;
  if (patch.description !== undefined) role.description = patch.description;
  if (patch.capabilities) {
    // Guard: the Administrator role must always keep admin.access.
    const caps = patch.capabilities.filter((c) => ALL_CAPABILITIES.includes(c));
    role.capabilities = id === ADMIN_ROLE_ID && !caps.includes('admin.access') ? [...caps, 'admin.access'] : caps;
  }
  return { ...role };
}

/** Upserts a full Role object into the cache — used to mirror a Dataverse write exactly, without recomputing guards a second time. */
export function replaceRoleInStore(role: Role): void {
  const i = roleStore.findIndex((r) => r.id === role.id);
  if (i >= 0) roleStore[i] = role;
  else roleStore.push(role);
}

/**
 * Replaces the whole cache with a fresh Dataverse read. Roles created
 * directly in Dataverse (not through this app's "New role") are otherwise
 * invisible to this cache until the next restart — including to
 * setAssignedRoleIds()'s validation, which would silently drop an
 * assignment to such a role. Routes that already do a fresh dvListRoles()
 * read for their own response (GET /roles, GET /people) call this to heal
 * the cache opportunistically, without adding a Dataverse call to the
 * request-authorization hot path.
 */
export function replaceAllRolesInStore(roles: Role[]): void {
  roleStore = roles.map((r) => ({ ...r }));
}

export function deleteRole(id: string): boolean {
  const role = roleStore.find((r) => r.id === id);
  if (!role || role.system) return false; // system roles are protected
  roleStore = roleStore.filter((r) => r.id !== id);
  for (const [userId, roleIds] of assignmentStore) {
    assignmentStore.set(userId, roleIds.filter((r) => r !== id));
  }
  return true;
}

// --- Assignments -----------------------------------------------------------
export const getAssignedRoleIds = (userId: string): string[] => assignmentStore.get(userId) ?? [];

/** Same idea as replaceAllRolesInStore(), for the assignment side of the cache. */
export function replaceAllAssignmentsInStore(assignments: Map<string, string[]>): void {
  assignmentStore.clear();
  for (const [userId, roleIds] of assignments) assignmentStore.set(userId, roleIds);
}

export function setAssignedRoleIds(userId: string, roleIds: string[]): string[] {
  const valid = roleIds.filter((id) => roleStore.some((r) => r.id === id));
  assignmentStore.set(userId, valid);
  return valid;
}

// --- Boot-time hydration (Dataverse -> hot-path cache) ----------------------
/** Loads the last-persisted roles/assignments into the in-memory cache. No-op if Dataverse isn't configured. */
export async function hydrateRolesFromDataverse(): Promise<void> {
  if (!rolesDataverseEnabled()) return;
  const [roles, assignments] = await Promise.all([dvListRoles(), dvListAllAssignments()]);
  roleStore = roles;
  assignmentStore.clear();
  for (const [userId, roleIds] of assignments) assignmentStore.set(userId, roleIds);
}

// --- Per-user capability grants (additive) ---------------------------------
export const getUserGrants = (userId: string): Capability[] => grantStore.get(userId) ?? [];

export function setUserGrants(userId: string, caps: Capability[]): Capability[] {
  const valid = caps.filter((c) => ALL_CAPABILITIES.includes(c));
  grantStore.set(userId, valid);
  return valid;
}

/** Same idea as replaceAllAssignmentsInStore(), for grants — heals the cache if a grant was set directly in Dataverse. */
export function replaceAllGrantsInStore(grants: Map<string, Capability[]>): void {
  grantStore.clear();
  for (const [userId, caps] of grants) grantStore.set(userId, caps);
}

/** Loads the last-persisted grants into the in-memory cache. No-op if Dataverse isn't configured. */
export async function hydrateGrantsFromDataverse(): Promise<void> {
  if (!grantsDataverseEnabled()) return;
  const grants = await dvListAllGrants();
  replaceAllGrantsInStore(grants);
}

// --- Effective capability resolution ---------------------------------------
/**
 * Compute a user's effective capabilities: the Employee baseline + any assigned
 * roles, plus all capabilities if they're a bootstrap admin (Entra group).
 */
export function resolveCapabilities(userId: string, isBootstrapAdmin: boolean): {
  roleIds: string[];
  capabilities: Capability[];
} {
  if (isBootstrapAdmin) {
    return { roleIds: [ADMIN_ROLE_ID], capabilities: [...ALL_CAPABILITIES] };
  }
  const assigned = getAssignedRoleIds(userId);
  // Everyone implicitly has the default Employee role.
  const roleIds = assigned.includes(DEFAULT_ROLE_ID) ? assigned : [DEFAULT_ROLE_ID, ...assigned];
  const caps = new Set<Capability>();
  for (const rid of roleIds) getRole(rid)?.capabilities.forEach((c) => caps.add(c));
  // Per-user grants (e.g. Document Access) layer on top of role capabilities.
  for (const c of getUserGrants(userId)) caps.add(c);
  return { roleIds, capabilities: [...caps] };
}

export const roleNamesFor = (roleIds: string[]): string[] =>
  roleIds.map((id) => getRole(id)?.name).filter((n): n is string => Boolean(n));

/**
 * Every userId currently holding `cap` via an explicit role assignment —
 * used to target in-app notifications at whoever handles a given workflow
 * (e.g. Help Desk agents, request approvers), without needing a Graph
 * directory call. Only considers people in assignmentStore (i.e. anyone
 * who's ever had a role assigned beyond the implicit Employee default),
 * since `cap` is by definition not a baseline capability everyone already
 * has. Deliberately excludes bootstrap admins (Entra Global Admin / the
 * ADMIN_EMAILS allowlist) who've never been assigned an app role — a real
 * gap in edge cases, but resolving that would need a Graph call on every
 * ticket/request submission, which isn't worth it for a notification nice-
 * to-have.
 */
export function usersWithCapability(cap: Capability): string[] {
  return [...assignmentStore.keys()].filter((id) => resolveCapabilities(id, false).capabilities.includes(cap));
}
