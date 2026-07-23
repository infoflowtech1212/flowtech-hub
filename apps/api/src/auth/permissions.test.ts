import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES,
  createRole,
  deleteRole,
  resolveCapabilities,
  setAssignedRoleIds,
} from './permissions.js';

describe('RBAC permission resolution', () => {
  it('gives every user the Employee baseline (no admin.access)', () => {
    const { capabilities } = resolveCapabilities('user-baseline', false);
    expect(capabilities).toContain('directory.view');
    expect(capabilities).toContain('documents.upload');
    expect(capabilities).not.toContain('admin.access');
    expect(capabilities).not.toContain('requests.approve');
  });

  it('bootstrap admins get every capability', () => {
    const { capabilities } = resolveCapabilities('user-admin', true);
    for (const cap of ALL_CAPABILITIES) expect(capabilities).toContain(cap);
  });

  it('assigning the Manager role adds approvals on top of the baseline', () => {
    setAssignedRoleIds('user-mgr', ['role-manager']);
    const { capabilities } = resolveCapabilities('user-mgr', false);
    expect(capabilities).toContain('requests.approve');
    expect(capabilities).toContain('directory.view'); // baseline still present
  });

  it('a custom role grants exactly its capabilities to assignees', () => {
    const role = createRole({ name: 'News Editor', capabilities: ['announcements.manage', 'admin.access', 'admin.content.manage'] });
    setAssignedRoleIds('user-editor', [role.id]);
    const { capabilities } = resolveCapabilities('user-editor', false);
    expect(capabilities).toContain('announcements.manage');
    expect(capabilities).toContain('admin.access');
    expect(capabilities).toContain('admin.content.manage');
    expect(capabilities).not.toContain('admin.roles.manage');
  });

  it('protects system roles from deletion but allows custom roles', () => {
    expect(deleteRole('role-employee')).toBe(false);
    expect(deleteRole('role-admin')).toBe(false);
    const custom = createRole({ name: 'Temp', capabilities: [] });
    expect(deleteRole(custom.id)).toBe(true);
  });
});
