import { InteractionRequiredAuthError } from '@azure/msal-node';
import { config } from '../config.js';
import { getMsalClient, withMsalCacheLock } from './msal.js';

/** Raised when the cached refresh token can't produce a new access token —
 *  the caller (requireAuth) maps this to a 401 so the SPA restarts sign-in. */
export class ReauthRequiredError extends Error {
  constructor(message = 'Re-authentication required') {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

/**
 * Silently acquire a downstream access token for the given account, using the
 * server-side cached refresh token. Never interactive — if silent fails, the
 * user must sign in again.
 */
export async function acquireToken(homeAccountId: string, scopes: string[]): Promise<string> {
  const cca = getMsalClient();
  return withMsalCacheLock(async () => {
    const account = await cca.getTokenCache().getAccountByHomeId(homeAccountId);
    if (!account) throw new ReauthRequiredError('No cached account');

    try {
      const result = await cca.acquireTokenSilent({ account, scopes });
      if (!result?.accessToken) throw new ReauthRequiredError('Empty token result');
      return result.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) throw new ReauthRequiredError();
      throw err;
    }
  });
}

/** Graph token using the configured delegated scopes. */
export const acquireGraphToken = (homeAccountId: string) =>
  acquireToken(homeAccountId, config.graph.scopes.filter((s) => !['openid', 'profile', 'email', 'offline_access'].includes(s)));

/** Dataverse token (.default scope) — used from Build Order step 5. */
export const acquireDataverseToken = (homeAccountId: string) =>
  acquireToken(homeAccountId, [config.dataverse.scope]);

/**
 * App-only (client credentials) Dataverse token — the app acts as its own
 * "application user" in Dataverse, so no per-user Dataverse license is needed.
 */
export async function acquireDataverseAppToken(): Promise<string> {
  const cca = getMsalClient();
  const scope = config.dataverse.scope || `${config.dataverse.url.replace(/\/$/, '')}/.default`;
  return withMsalCacheLock(async () => {
    const result = await cca.acquireTokenByClientCredential({ scopes: [scope] });
    if (!result?.accessToken) throw new Error('Could not acquire Dataverse app token');
    return result.accessToken;
  });
}
