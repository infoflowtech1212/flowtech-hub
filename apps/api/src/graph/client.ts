import { Client } from '@microsoft/microsoft-graph-client';
import { config } from '../config.js';

/**
 * Build a Microsoft Graph client bound to a per-request access-token accessor.
 * `Client.init` installs the default middleware chain, which includes the
 * RetryHandler — it honors `Retry-After` and backs off on 429/503 automatically
 * (satisfies the reliability requirement for Graph throttling).
 */
export function graphClientFor(getToken: () => Promise<string>): Client {
  // `baseUrl` must be the host only — the client appends `defaultVersion`. Strip
  // any trailing /v1.0 from the configured URL so we don't get /v1.0/v1.0/...
  const baseUrl = config.graph.baseUrl.replace(/\/v\d+(\.\d+)?\/?$/, '');
  return Client.init({
    baseUrl,
    defaultVersion: 'v1.0',
    authProvider: (done) => {
      getToken()
        .then((token) => done(null, token))
        .catch((err) => done(err, null));
    },
  });
}
