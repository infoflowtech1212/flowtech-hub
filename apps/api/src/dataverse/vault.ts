import axios from 'axios';
import type { VaultScope } from '@flowtech/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';

/**
 * Write a vault entry straight into the Dataverse "Public Vault" table as the
 * app's application user (client-credentials). A Power Automate flow triggered
 * on the new row handles notifications for shared (open) entries.
 *
 * Column logical names follow the publisher prefix (cre2b_). Override via
 * DATAVERSE_VAULT_TABLE / column env if your table uses a different prefix.
 *
 * SECURITY: the secret is stored here — use an encrypted column or a Key Vault
 * reference in production; restrict the table's security role tightly.
 */
const TABLE = process.env.DATAVERSE_VAULT_TABLE || 'cre2b_publicvaults'; // entity set (plural)
const P = process.env.DATAVERSE_VAULT_PREFIX || 'cre2b_'; // column prefix
// Scope is stored in a TEXT column (the original cre2b_scope is a Choice, which
// can't take "open"/"personal" strings). Override with DATAVERSE_VAULT_SCOPE_COL.
const SCOPE_COL = process.env.DATAVERSE_VAULT_SCOPE_COL || `${P}newscope`;

export function vaultDataverseEnabled(): boolean {
  return Boolean(config.dataverse.url);
}

export async function dvCreateVaultRow(entry: {
  title: string;
  username?: string;
  url?: string;
  notes?: string;
  category?: string;
  scope: VaultScope;
  secret?: string;
  addedById: string;
  addedByName: string;
}): Promise<void> {
  const token = await acquireDataverseAppToken();
  const base = `${config.dataverse.url.replace(/\/$/, '')}/api/data/v9.2`;
  const row: Record<string, unknown> = {
    [`${P}title`]: entry.title,
    [`${P}username`]: entry.username,
    [`${P}url`]: entry.url,
    [`${P}notes`]: entry.notes,
    [`${P}category`]: entry.category,
    [SCOPE_COL]: entry.scope,
    [`${P}secret`]: entry.secret,
    [`${P}addedbyid`]: entry.addedById,
    [`${P}addedbyname`]: entry.addedByName,
  };
  await axios.post(`${base}/${TABLE}`, row, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
    timeout: 10_000,
  });
  logger.info({ scope: entry.scope, title: entry.title }, 'vault entry written to Dataverse');
}
