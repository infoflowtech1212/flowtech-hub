import { Router } from 'express';
import { config, USE_MOCKS } from '../config.js';
import { logger } from '../logger.js';
import { acquireGraphToken } from './tokens.js';
import { checkAdminGroup, checkDirectoryAdmin } from '../graph/me.js';
import { cryptoProvider, getMsalClient } from './msal.js';
import {
  clearOAuthCookie,
  createSession,
  destroySession,
  getSession,
  readOAuthCookie,
  setOAuthCookie,
} from './session.js';

export const authRouter = Router();

/** Only relative same-origin paths are allowed as post-login return targets. */
function safeReturnTo(raw: unknown): string {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

// GET /auth/status — cheap check the SPA uses to decide sign-in vs. app.
authRouter.get('/status', (req, res) => {
  if (USE_MOCKS) return res.json({ authenticated: true, mode: 'mock' });
  res.json({ authenticated: Boolean(getSession(req)), mode: 'live' });
});

// GET /auth/login — begin Authorization Code + PKCE. Redirects to Entra.
authRouter.get('/login', async (req, res, next) => {
  if (USE_MOCKS) return res.redirect(config.webOrigin);
  try {
    const cca = getMsalClient();
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = cryptoProvider.createNewGuid();
    const returnTo = safeReturnTo(req.query.returnTo);

    setOAuthCookie(res, { pkceVerifier: verifier, state, returnTo });

    const authUrl = await cca.getAuthCodeUrl({
      scopes: config.graph.scopes,
      redirectUri: config.azure.redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
      prompt: 'select_account',
    });
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /auth/redirect — Entra returns here with the auth code.
authRouter.get('/redirect', async (req, res, next) => {
  if (USE_MOCKS) return res.redirect(config.webOrigin);
  try {
    const oauth = readOAuthCookie(req);
    clearOAuthCookie(res);

    if (req.query.error) {
      logger.warn({ error: req.query.error, desc: req.query.error_description }, 'auth error from Entra');
      return res.redirect(`${config.webOrigin}/?authError=1`);
    }
    if (!oauth || typeof req.query.code !== 'string' || req.query.state !== oauth.state) {
      return res.redirect(`${config.webOrigin}/?authError=state`);
    }

    const cca = getMsalClient();
    const result = await cca.acquireTokenByCode({
      code: req.query.code,
      scopes: config.graph.scopes,
      redirectUri: config.azure.redirectUri,
      codeVerifier: oauth.pkceVerifier,
    });

    if (!result.account) {
      return res.redirect(`${config.webOrigin}/?authError=account`);
    }

    // Resolve identity, domain, and bootstrap-admin once, at login.
    const homeAccountId = result.account.homeAccountId;
    const userId =
      (result.account.idTokenClaims as { oid?: string } | undefined)?.oid ??
      result.account.localAccountId;
    const claims = result.account.idTokenClaims as { email?: string; preferred_username?: string } | undefined;
    const email = (result.account.username || claims?.preferred_username || claims?.email || '').toLowerCase();

    // Domain lockdown — only permitted email domains may sign in.
    if (config.allowedDomains.length) {
      const domainOk = config.allowedDomains.some((d) => email.endsWith(`@${d}`));
      if (!domainOk) {
        logger.warn({ email }, 'sign-in blocked: email domain not allowed');
        // Drop the account from the token cache so it doesn't linger.
        try {
          const acct = await cca.getTokenCache().getAccountByHomeId(homeAccountId);
          if (acct) await cca.getTokenCache().removeAccount(acct);
        } catch {
          /* best-effort */
        }
        return res.redirect(`${config.webOrigin}/?authError=domain`);
      }
    }

    // Admin portal access is for Microsoft 365 / Entra admins. Primary signal:
    // the user holds an admin directory role (Global Administrator). The email
    // allowlist and the optional Entra admin group act as manual overrides.
    const getGraphToken = () => acquireGraphToken(homeAccountId);
    const isBootstrapAdmin =
      (await checkDirectoryAdmin(getGraphToken)) ||
      config.adminEmails.includes(email) ||
      (await checkAdminGroup(getGraphToken));
    logger.info({ email, isBootstrapAdmin }, 'sign-in: resolved admin status');

    // Establish the strict server-side session; tokens stay in the msal cache.
    createSession(res, { homeAccountId, userId, isBootstrapAdmin });
    res.redirect(`${config.webOrigin}${oauth.returnTo}`);
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — clear the local session (and account from the cache).
authRouter.post('/logout', async (req, res, next) => {
  if (USE_MOCKS) return res.json({ ok: true });
  try {
    const session = getSession(req);
    if (session) {
      const cca = getMsalClient();
      const account = await cca.getTokenCache().getAccountByHomeId(session.homeAccountId);
      if (account) await cca.getTokenCache().removeAccount(account);
    }
    destroySession(req, res);
    res.json({
      ok: true,
      // The SPA can optionally redirect here to end the Entra SSO session too.
      logoutUrl: `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(config.azure.postLogoutRedirectUri)}`,
    });
  } catch (err) {
    next(err);
  }
});
