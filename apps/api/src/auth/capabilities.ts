import type { Capability, CapabilityInfo, Role } from '@flowtech/shared';

/**
 * Pure capability/role catalog data — no store, no Dataverse. Deliberately
 * has zero imports from permissions.ts or dataverse/roles.ts so both of
 * those can depend on this without a circular import (permissions.ts reads
 * from dataverse/roles.ts for boot-time hydration; dataverse/roles.ts reads
 * the seed data here to auto-create the system roles when missing).
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
  { key: 'courses.view', group: 'Courses', label: 'View courses', description: 'Browse course videos and materials.' },
  { key: 'courses.upload', group: 'Courses', label: 'Upload course content', description: 'Add files to the courses library.' },
  { key: 'courses.share', group: 'Courses', label: 'Share courses', description: 'Create shareable links to course files.' },
  { key: 'vault.view', group: 'Password Vault', label: 'Use password vault', description: 'Access personal + permitted shared entries.' },
  { key: 'vault.manage', group: 'Password Vault', label: 'Manage shared vault', description: 'Add/edit shared (open) vault entries.' },
  { key: 'expenses.view', group: 'Expenses', label: 'View expenses', description: 'See the company expense tracker.' },
  { key: 'expenses.manage', group: 'Expenses', label: 'Manage expenses', description: 'Add and edit expense lines.' },
  { key: 'notes.view', group: 'Admin Notes', label: 'Admin notes & ideas', description: 'Read and post private admin-only notes.' },
  { key: 'holidays.manage', group: 'Calendar', label: 'Manage company holidays', description: 'Add/remove company holidays shown on everyone\'s calendar.' },
  { key: 'attendance.view', group: 'Attendance', label: 'View attendance', description: 'Punch in/out and see your own attendance history.' },
  { key: 'attendance.manage', group: 'Attendance', label: 'Manage attendance', description: 'View the team-wide attendance dashboard.' },
  { key: 'admin.access', group: 'Admin', label: 'Access admin portal', description: 'Open the admin console.' },
  { key: 'admin.roles.manage', group: 'Admin', label: 'Manage roles', description: 'Create/edit roles and assignments.' },
  { key: 'admin.users.manage', group: 'Admin', label: 'Manage people access', description: 'Assign roles to employees.' },
  { key: 'admin.content.manage', group: 'Admin', label: 'Manage content', description: 'Announcements, quick links, request types.' },
  { key: 'admin.settings.manage', group: 'Admin', label: 'Manage settings', description: 'Configure the Hub.' },
];

export const ALL_CAPABILITIES: Capability[] = CAPABILITY_CATALOG.map((c) => c.key);

export const EMPLOYEE_CAPS: Capability[] = [
  'directory.view',
  'documents.view',
  'calendar.view',
  'requests.view',
  'requests.create',
  'announcements.view',
  'notifications.view',
  'assets.view',
  'projects.view',
  'helpdesk.view',
  'legal.view',
  // documents.upload and clientdocs.view are intentionally NOT in the baseline —
  // everyone can browse the Document Center, but uploading to it (and all of
  // Client Documents) is access-controlled: admins grant these per person on
  // the Document Access admin page.
  'courses.view',
  'attendance.view',
  'vault.view',
];

/** The role every authenticated user gets implicitly. */
export const DEFAULT_ROLE_ID = 'role-employee';
export const ADMIN_ROLE_ID = 'role-admin';

/**
 * Seed roles — used both as the in-memory store's starting state (mock/no
 * Dataverse) and to auto-create the two system roles on a Dataverse table
 * that's missing them (see dataverse/roles.ts). The system roles' ids are
 * hardcoded elsewhere (DEFAULT_ROLE_ID/ADMIN_ROLE_ID) so they must never change.
 */
export const seedRoles = (): Role[] => [
  {
    id: DEFAULT_ROLE_ID,
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
    id: ADMIN_ROLE_ID,
    name: 'Administrator',
    description: 'Full access, including the admin portal.',
    system: true,
    capabilities: [...ALL_CAPABILITIES],
  },
];
