import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal server-side session store. The browser holds only an opaque,
 * httpOnly, SameSite=strict cookie (`ft_session`); everything sensitive
 * (the msal account id, CSRF secret) stays here on the server.
 *
 * In-memory Map — fine for a single instance / dev. TODO(prod): back this with
 * Redis (or a signed encrypted cookie store) so sessions survive restarts and
 * scale across instances.
 */
export interface Session {
  id: string;
  /** msal-node account identifier used for silent token acquisition. */
  homeAccountId: string;
  /** Entra object id (oid) — the stable key for role assignments. */
  userId: string;
  /** Resolved once at login: is this user in the Entra admin group? */
  isBootstrapAdmin: boolean;
  /** Double-submit CSRF secret; mirrored in the readable `ft_csrf` cookie. */
  csrfToken: string;
  createdAt: number;
}

const SESSION_COOKIE = 'ft_session';
const CSRF_COOKIE = 'ft_csrf';
const OAUTH_COOKIE = 'ft_oauth';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h

const store = new Map<string, Session>();

// Persist sessions across restarts so redeploys don't sign users out. In
// production set DATA_DIR to a mounted volume (e.g. /data) so it survives
// container recreation. TODO(prod): Redis for multi-instance scale-out.
const SESSION_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'sessions.json')
  : path.resolve(__dirname, '../../.sessions.json');
try {
  const raw = readFileSync(SESSION_PATH, 'utf8');
  (JSON.parse(raw) as [string, Session][]).forEach(([id, s]) => store.set(id, s));
} catch {
  /* no sessions file yet */
}
function persistSessions() {
  try {
    writeFileSync(SESSION_PATH, JSON.stringify([...store.entries()]), 'utf8');
  } catch {
    /* best-effort */
  }
}

const baseCookie = {
  httpOnly: true,
  secure: config.isProd,
  path: '/',
} as const;

export function createSession(
  res: Response,
  init: { homeAccountId: string; userId: string; isBootstrapAdmin: boolean },
): Session {
  const session: Session = {
    id: randomUUID(),
    homeAccountId: init.homeAccountId,
    userId: init.userId,
    isBootstrapAdmin: init.isBootstrapAdmin,
    csrfToken: randomBytes(24).toString('hex'),
    createdAt: Date.now(),
  };
  store.set(session.id, session);
  persistSessions();

  // Strict session cookie — never sent on cross-site requests (CSRF-safe).
  res.cookie(SESSION_COOKIE, session.id, {
    ...baseCookie,
    sameSite: 'strict',
    maxAge: MAX_AGE_MS,
  });
  // Readable (non-httpOnly) CSRF cookie for the double-submit pattern.
  res.cookie(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: MAX_AGE_MS,
  });
  return session;
}

export function getSession(req: Request): Session | undefined {
  const id = req.cookies?.[SESSION_COOKIE];
  if (!id) return undefined;
  const session = store.get(id);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > MAX_AGE_MS) {
    store.delete(id);
    return undefined;
  }
  return session;
}

export function destroySession(req: Request, res: Response): void {
  const id = req.cookies?.[SESSION_COOKIE];
  if (id) store.delete(id);
  persistSessions();
  res.clearCookie(SESSION_COOKIE, { ...baseCookie, sameSite: 'strict' });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure: config.isProd, sameSite: 'strict', path: '/' });
}

// --- Transient OAuth handshake cookie -------------------------------------
// Holds the PKCE verifier + state between /auth/login and /auth/redirect.
// MUST be SameSite=lax: the return navigation from login.microsoftonline.com is
// a cross-site top-level GET, which a strict cookie would NOT accompany.
interface OAuthState {
  pkceVerifier: string;
  state: string;
  returnTo: string;
}

export function setOAuthCookie(res: Response, data: OAuthState): void {
  res.cookie(OAUTH_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 10 * 60 * 1000, // 10 min
    signed: true,
  });
}

export function readOAuthCookie(req: Request): OAuthState | undefined {
  const raw = req.signedCookies?.[OAUTH_COOKIE];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OAuthState;
  } catch {
    return undefined;
  }
}

export function clearOAuthCookie(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/auth' });
}
