import express from 'express';
import { describe, expect, it } from 'vitest';
import { apiRouter } from './api.js';
import { requireAuth } from '../auth/middleware.js';

/** Minimal in-process harness — boots the router and hits it via fetch.
 *  requireAuth runs first (mock mode injects a full-capability context). */
async function withServer(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use('/api', requireAuth, apiRouter);
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

describe('BFF api routes (mock mode)', () => {
  it('GET /api/me returns a profile', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/me`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('displayName');
      expect(Array.isArray(body.roles)).toBe(true);
    });
  });

  it('GET /api/directory filters by query', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/directory?q=priya`);
      const body = await res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].displayName).toMatch(/Priya/);
    });
  });

  it('GET /api/directory/:id 404s for unknown id', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/directory/nope`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('not_found');
    });
  });
});
