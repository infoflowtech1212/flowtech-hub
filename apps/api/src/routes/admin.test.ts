import express from 'express';
import { describe, expect, it, beforeEach } from 'vitest';
import type { Capability } from '@flowtech/shared';
import type { AuthContext } from '../auth/middleware.js';
import { adminRouter } from './admin.js';
import { requireCapability } from '../auth/middleware.js';

/**
 * Enforcement tests: prove the capability gates actually DENY the right
 * requests. The mock user has every capability, so day-to-day mock runs never
 * exercise a denial — these do, by injecting a context with a chosen capability
 * set ahead of the router.
 */
let currentCaps: Capability[] = [];

function makeAuth(caps: Capability[]): AuthContext {
  return {
    homeAccountId: null,
    userId: 'test-user',
    isMock: true,
    isBootstrapAdmin: false,
    roleIds: [],
    capabilities: caps,
    has: (c) => caps.includes(c),
    getGraphToken: async () => 'x',
    getDataverseToken: async () => 'x',
  };
}

function withAdmin(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = makeAuth(currentCaps);
    next();
  });
  app.use('/admin', adminRouter);
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      try {
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

beforeEach(() => {
  currentCaps = [];
});

describe('admin router capability enforcement', () => {
  it('blocks the whole admin surface without admin.access (403)', async () => {
    currentCaps = ['directory.view']; // an ordinary employee
    await withAdmin(async (base) => {
      for (const path of ['/admin/roles', '/admin/people', '/admin/announcements', '/admin/capabilities']) {
        const res = await fetch(`${base}${path}`);
        expect(res.status, path).toBe(403);
      }
    });
  });

  it('allows the catalog with admin.access but blocks roles without admin.roles.manage', async () => {
    currentCaps = ['admin.access'];
    await withAdmin(async (base) => {
      expect((await fetch(`${base}/admin/capabilities`)).status).toBe(200);
      expect((await fetch(`${base}/admin/roles`)).status).toBe(403);
      const post = await fetch(`${base}/admin/roles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X', capabilities: [] }),
      });
      expect(post.status).toBe(403);
    });
  });

  it('permits role management with admin.roles.manage and validates input', async () => {
    currentCaps = ['admin.access', 'admin.roles.manage'];
    await withAdmin(async (base) => {
      expect((await fetch(`${base}/admin/roles`)).status).toBe(200);

      // Invalid body → 400
      const bad = await fetch(`${base}/admin/roles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' }), // missing capabilities, name too short
      });
      expect(bad.status).toBe(400);

      // Valid create → 201
      const good = await fetch(`${base}/admin/roles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'QA Reviewer', capabilities: ['documents.view'] }),
      });
      expect(good.status).toBe(201);
      const created = (await good.json()) as { id: string };

      // Custom role can be deleted → 204
      const del = await fetch(`${base}/admin/roles/${created.id}`, { method: 'DELETE' });
      expect(del.status).toBe(204);

      // System role cannot be deleted → 400
      const delSys = await fetch(`${base}/admin/roles/role-employee`, { method: 'DELETE' });
      expect(delSys.status).toBe(400);
    });
  });

  it('gates people access + assignment on admin.users.manage', async () => {
    currentCaps = ['admin.access'];
    await withAdmin(async (base) => {
      expect((await fetch(`${base}/admin/people`)).status).toBe(403);
    });
    currentCaps = ['admin.access', 'admin.users.manage'];
    await withAdmin(async (base) => {
      const people = await fetch(`${base}/admin/people`);
      expect(people.status).toBe(200);
      const assign = await fetch(`${base}/admin/people/p-002/roles`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleIds: ['role-manager'] }),
      });
      expect(assign.status).toBe(200);
      const body = (await assign.json()) as { roleNames: string[] };
      expect(body.roleNames).toContain('Manager');
    });
  });

  it('gates announcement management on admin.content.manage', async () => {
    currentCaps = ['admin.access', 'admin.content.manage'];
    await withAdmin(async (base) => {
      const create = await fetch(`${base}/admin/announcements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hello team', body: 'Body text' }),
      });
      expect(create.status).toBe(201);
    });
    // Without the capability → 403
    currentCaps = ['admin.access'];
    await withAdmin(async (base) => {
      expect((await fetch(`${base}/admin/announcements`)).status).toBe(403);
    });
  });
});

describe('requireCapability middleware (unit)', () => {
  it('calls next when the capability is present, 403s otherwise', () => {
    const mk = (has: boolean) => {
      let status = 0;
      let nexted = false;
      const req = { auth: { has: () => has } } as unknown as express.Request;
      const res = {
        status(s: number) {
          status = s;
          return this;
        },
        json() {
          return this;
        },
      } as unknown as express.Response;
      requireCapability('admin.access')(req, res, () => {
        nexted = true;
      });
      return { status, nexted };
    };
    expect(mk(true)).toEqual({ status: 0, nexted: true });
    expect(mk(false)).toEqual({ status: 403, nexted: false });
  });
});
