import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ConfidentialClientApplication,
  CryptoProvider,
  LogLevel,
  type Configuration,
  type ICachePlugin,
} from '@azure/msal-node';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev token-cache persistence: keep the msal cache (incl. refresh tokens) in a
 * file so a server restart doesn't sign everyone out during local iteration.
 * The file holds tokens — it is gitignored. TODO(prod): replace with a
 * distributed, encrypted cache (Redis) — do not ship file-based cache.
 */
// Holds refresh tokens — keep on a mounted volume via DATA_DIR in production so
// redeploys don't sign everyone out. TODO(prod): encrypted distributed cache (Redis).
const CACHE_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'msal-cache.json')
  : path.resolve(__dirname, '../../.msal-cache.json');
const cachePlugin: ICachePlugin = {
  beforeCacheAccess: async (ctx) => {
    try {
      ctx.tokenCache.deserialize(await fs.readFile(CACHE_PATH, 'utf8'));
    } catch {
      /* no cache yet */
    }
  },
  afterCacheAccess: async (ctx) => {
    if (ctx.cacheHasChanged) {
      try {
        await fs.writeFile(CACHE_PATH, ctx.tokenCache.serialize(), 'utf8');
      } catch (err) {
        logger.warn({ err }, 'failed to persist msal cache');
      }
    }
  },
};

/**
 * Confidential-client MSAL app for the BFF. This is the ONLY place tokens are
 * acquired; they live in msal-node's in-memory token cache, keyed by account,
 * and never leave the server. The browser only ever holds an opaque session id.
 *
 * NOTE: the token cache is in-memory, so a server restart signs users out. For
 * production, plug a distributed cache plugin (Redis) here — see
 * `cache.cachePlugin` in the MSAL docs. TODO(prod): persistent token cache.
 */
let cca: ConfidentialClientApplication | null = null;

export function getMsalClient(): ConfidentialClientApplication {
  if (cca) return cca;
  if (!config.azure.clientId || !config.azure.clientSecret || !config.azure.tenantId) {
    throw new Error('MSAL not configured — set AZURE_TENANT_ID / CLIENT_ID / CLIENT_SECRET in .env');
  }
  const msalConfig: Configuration = {
    auth: {
      clientId: config.azure.clientId,
      authority: `https://login.microsoftonline.com/${config.azure.tenantId}`,
      clientSecret: config.azure.clientSecret,
    },
    system: {
      loggerOptions: {
        logLevel: config.isProd ? LogLevel.Warning : LogLevel.Info,
        piiLoggingEnabled: false,
        loggerCallback: (level, message) => {
          if (level <= LogLevel.Warning) logger.debug({ msal: true }, message);
        },
      },
    },
    cache: { cachePlugin },
  };
  cca = new ConfidentialClientApplication(msalConfig);
  return cca;
}

/** PKCE + state generator shared by the login/redirect handlers. */
export const cryptoProvider = new CryptoProvider();

/**
 * Serializes every operation that touches the shared MSAL token cache. The
 * file-based cache plugin above does a full read-deserialize-...-write per
 * access with no locking, and `cca` is one singleton shared by every user's
 * requests — concurrent calls (routine: a single page load fires several
 * parallel /api calls, each acquiring a token) can interleave a read from one
 * request between another's read and write, silently losing or corrupting
 * cached accounts/tokens. That produces intermittent auth/Graph failures for
 * otherwise-valid sessions. This queues cache access process-wide so only one
 * such operation runs at a time.
 */
let cacheLock: Promise<unknown> = Promise.resolve();
export function withMsalCacheLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = cacheLock.then(fn, fn);
  cacheLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
