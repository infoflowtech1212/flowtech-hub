import type { Capability, CapabilityInfo, Role } from '@flowtech/shared';

/**
 * Authorization catalog + store.
 *
 * Model (hybrid): membership in the Entra ADMIN_GROUP_ID bootstraps a user as a
 * root admin (they always get every capability — you can't lock yourself out).
 * Everyone else's access is the union of the capabilities of the app-managed
 * roles assigned to them here.
 *
 * Persistence: in-memory for dev so the whole thing is demoable and admin edits
 * stick for the session. TODO(prod): back `roleStore` and `assignmentStore`
 * with Dataverse tables (Roles, RoleAssignments) — the function surface below is
 * the seam to swap.
 */

// --- Capability catalog (drives the admin role editor) ---------------------
export const CAPABILITY_CATALOG: CapabilityInfo[] = [
  { key: 'directory.view', group: 'Directory', label: 'View directory', description: 'Browse people and org chart.' },
  { key: 'documents.view', group: 'Documents', label: 'View documents', description: 'Browse the document library.' },
  { key: 'documents.upload', group: 'Documents', label: 'Upload documents', description: 'Add files to the library.' },
  { key: 'documents.delete', group: 'Documents', label: 'Delete documents', description: 'Remove files from the library.' },
  { key: 'documents.share', group: 'Documents', label: 'Share documents', description: 'Create shareable links to files.' },
  { key: 'calendar.view', group: 'Calendar', label: 'View calendar', description: 'See company + personal events.' },
  { key: 'requests.view', group: 'Requests', label: 'View requests', description: 'See own requests.' },
  { key: 'requests.create', group: 'Requests', label: 'Create requests', description: 'Submit leave/expense/doc requests.' },
  { key: 'requests.approve', group: 'Requests', label: 'Approve requests', description: 'Approve or reject requests.' },
  { key: 'announcements.view', group: 'News', label: 'View announcements', description: 'Read company news.' },
  { key: 'announcements.manage', group: 'News', label: 'Manage announcements', description: 'Author and edit company news.' },
  { key: 'notifications.view', group: 'Notifications', label: 'View notifications', description: 'See the notification center.' },
  { key: 'assets.view', group: 'Assets', label: 'View assets', description: 'Browse the asset tracker.' },
  { key: 'assets.manage', group: 'Assets', label: 'Manage assets', description: 'Add and edit tracked assets.' },
  { key: 'projects.view', group: 'Projects', label: 'View projects', description: 'See project workstreams.' },
  { key: 'projects.manage', group: 'Projects', label: 'Manage projects', description: 'Create and edit projects.' },
  { key: 'helpdesk.view', group: 'Help Desk', label: 'View help desk', description: 'See and submit tickets.' },
  { key: 'helpdesk.manage', group: 'Help Desk', label: 'Manage help desk', description: 'Triage and resolve tickets.' },
  { key: 'legal.view', group: 'Legal', label: 'View legal', description: 'Browse the legal register.' },
  { key: 'legal.manage', group: 'Legal', label: 'Manage legal', description: 'Add and edit legal documents.' },
  { key: 'clientdocs.view', group: 'Client', label: 'View client documents', description: 'Browse client documents.' },
  { key: 'clientdocs.manage', group: 'Client', label: 'Manage client documents', description: 'Upload client documents.' },
  { key: 'vault.view', group: 'Password Vault', label: 'Use password vault', description: 'Access personal + permitted shared entries.' },
  { key: 'vault.manage', group: 'Password Vault', label: 'Manage shared vault', description: 'Add/edit shared (open) vault entries.' },
  { key: 'expenses.view', group: 'Expenses', label: 'View expenses', description: 'See the company expense tracker.' },
  { key: 'expenses.manage', group: 'Expenses', label: 'Manage expenses', description: 'Add and edit expense lines.' },
  { key: 'notes.view', group: 'Admin Notes', label: 'Admin notes & ideas', description: 'Read and post private admin-only notes.' },
  { key: 'holidays.manage', group: 'Calendar', label: 'Manage company holidays', description: 'Add/remove company holidays shown on everyone\'s calendar.' },
  { key: 'admin.access', group: 'Admin', label: 'Access admin portal', description: 'Open the admin console.' },
  { key: 'admin.roles.manage', group: 'Admin', label: 'Manage roles', description: 'Create/edit roles and assignments.' },
  { key: 'admin.users.manage', group: 'Admin', label: 'Manage people access', description: 'Assign roles to employees.' },
  { key: 'admin.content.manage', group: 'Admin', label: 'Manage content', description: 'Announcements, quick links, request types.' },
  { key: 'admin.settings.manage', group: 'Admin', label: 'Manage settings', description: 'Configure the Hub.' },
];

export const ALL_CAPABILITIES: Capability[] = CAPABILITY_CATALOG.map((c) => c.key);

const EMPLOYEE_CAPS: Capability[] = [
  'directory.view',
  'documents.view',
  'documents.upload',
  'calendar.view',
  'requests.view',
  'requests.create',
  'announcements.view',
  'notifications.view',
  'assets.view',
  'projects.view',
  'helpdesk.view',
  'legal.view',
  // clientdocs.view is intentionally NOT in the baseline — client documents are
  // access-controlled: admins grant clientdocs.view per person (Document Access).
  'vault.view',
];

// --- Seed roles ------------------------------------------------------------
const seedRoles = (): Role[] => [
  {
    id: 'role-employee',
    name: 'Employee',
    description: 'Default access for all staff.',
    system: true,
    capabilities: [...EMPLOYEE_CAPS],
  },
  {
    id: 'role-manager',
    name: 'Manager',
    description: 'Employee access plus approvals.',
    system: false,
    capabilities: [...EMPLOYEE_CAPS, 'requests.approve'],
  },
  {
    id: 'role-admin',
    name: 'Administrator',
    description: 'Full access, including the admin portal.',
    system: true,
    capabilities: [...ALL_CAPABILITIES],
  },
];

// In-memory stores (dev). userId -> roleIds.
let roleStore: Role[] = seedRoles();
const assignmentStore = new Map<string, string[]>();
// Per-user capability grants layered ON TOP of roles (e.g. document access
// control). userId -> extra capabilities. TODO(prod): Dataverse.
const grantStore = new Map<string, Capability[]>();

/** The role every authenticated user gets implicitly. */
export const DEFAULT_ROLE_ID = 'role-employee';
export const ADMIN_ROLE_ID = 'role-admin';

// --- Role CRUD -------------------------------------------------------------
export const listRoles = (): Role[] => roleStore.map((r) => ({ ...r }));
export const getRole = (id: string): Role | undefined => roleStore.find((r) => r.id === id);

export function createRole(input: { name: string; description?: string; capabilities: Capability[] }): Role {
  const role: Role = {
    id: `role-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${roleStore.length + 1}`,
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

export function setAssignedRoleIds(userId: string, roleIds: string[]): string[] {
  const valid = roleIds.filter((id) => roleStore.some((r) => r.id === id));
  assignmentStore.set(userId, valid);
  return valid;
}

// --- Per-user capability grants (additive) ---------------------------------
export const getUserGrants = (userId: string): Capability[] => grantStore.get(userId) ?? [];

export function setUserGrants(userId: string, caps: Capability[]): Capability[] {
  const valid = caps.filter((c) => ALL_CAPABILITIES.includes(c));
  grantStore.set(userId, valid);
  return valid;
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
