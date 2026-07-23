import express from 'express';
import cookieParser from 'cookie-parser';
import { describe, expect, it } from 'vitest';
import { csrfProtection, requireAuth } from './middleware.js';
import { authRouter } from './routes.js';

/**
 * In mock mode (no tenant configured) auth is bypassed: requireAuth injects a
 * mock context and csrfProtection is a no-op, so the whole app is demoable.
 * These tests assert that contract. Live-mode flows require a real tenant and
 * are exercised manually per SETUP.md.
 */
async function withApp(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(cookieParser('test-secret'));
  app.use('/auth', authRouter);
  app.use('/api', requireAuth, csrfProtection, (req, res) => {
    res.json({ method: req.method, isMock: req.auth?.isMock });
  });
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

describe('auth middleware (mock mode)', () => {
  it('requireAuth injects a mock context and allows GET', async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/thing`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { isMock: boolean };
      expect(body.isMock).toBe(true);
    });
  });

  it('csrfProtection is a no-op for writes in mock mode', async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/thing`, { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  it('GET /auth/status reports mock mode', async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/auth/status`);
      const body = (await res.json()) as { authenticated: boolean; mode: string };
      expect(body.mode).toBe('mock');
      expect(body.authenticated).toBe(true);
    });
  });
});
