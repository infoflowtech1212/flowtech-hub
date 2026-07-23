import type { NextFunction, Request, Response } from 'express';
import type { Capability } from '@flowtech/shared';
import { USE_MOCKS } from '../config.js';
import { mockUser } from '../mocks.js';
import { acquireDataverseToken, acquireGraphToken } from './tokens.js';
import { getSession } from './session.js';
import { resolveCapabilities } from './permissions.js';

/**
 * Auth context attached to authenticated requests. `getGraphToken` lazily
 * acquires a Graph access token from the server-side cache — route handlers
 * never see refresh tokens. `capabilities` is the resolved RBAC set.
 */
export interface AuthContext {
  homeAccountId: string | null;
  userId: string;
  isMock: boolean;
  isBootstrapAdmin: boolean;
  roleIds: string[];
  capabilities: Capability[];
  has: (cap: Capability) => boolean;
  getGraphToken: () => Promise<string>;
  getDataverseToken: () => Promise<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Gate protecting `/api/*`. In MOCK mode (tenant not wired) it injects a mock
 * context so the app is fully demoable. In LIVE mode it requires a valid
 * server-side session and exposes a Graph-token accessor.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (USE_MOCKS) {
    // Mock user is a bootstrap admin so the admin portal is fully demoable.
    const { roleIds, capabilities } = resolveCapabilities(mockUser.id, true);
    req.auth = {
      homeAccountId: null,
      userId: mockUser.id,
      isMock: true,
      isBootstrapAdmin: true,
      roleIds,
      capabilities,
      has: (cap) => capabilities.includes(cap),
      getGraphToken: async () => {
        throw new Error('Graph token requested in mock mode');
      },
      getDataverseToken: async () => {
        throw new Error('Dataverse token requested in mock mode');
      },
    };
    return next();
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign-in required' } });
    return;
  }

  // Capabilities are resolved per-request from the in-memory store, so an admin
  // changing a user's roles takes effect immediately (no re-login required).
  const { roleIds, capabilities } = resolveCapabilities(session.userId, session.isBootstrapAdmin);
  req.auth = {
    homeAccountId: session.homeAccountId,
    userId: session.userId,
    isMock: false,
    isBootstrapAdmin: session.isBootstrapAdmin,
    roleIds,
    capabilities,
    has: (cap) => capabilities.includes(cap),
    getGraphToken: () => acquireGraphToken(session.homeAccountId),
    getDataverseToken: () => acquireDataverseToken(session.homeAccountId),
  };
  next();
}

/** Guard a route on a specific capability. 403 when the user lacks it. */
export function requireCapability(cap: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.auth?.has(cap)) return next();
    res.status(403).json({
      error: { code: 'forbidden', message: `Missing capability: ${cap}` },
    });
  };
}

/**
 * CSRF protection (double-submit) for state-changing methods. The client reads
 * the non-httpOnly `ft_csrf` cookie and echoes it in `x-csrf-token`; we compare
 * against the server-side session secret. Safe (GET/HEAD/OPTIONS) methods pass.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (USE_MOCKS) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const session = getSession(req);
  const header = req.get('x-csrf-token');
  if (!session || !header || header !== session.csrfToken) {
    res.status(403).json({ error: { code: 'csrf_failed', message: 'Invalid CSRF token' } });
    return;
  }
  next();
}
