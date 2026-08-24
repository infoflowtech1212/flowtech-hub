import type { VaultScope } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';
import { hashPinToString, newSalt, pinMatches } from '../lib/pin.js';

/**
 * Live Dataverse persistence for the vault PIN — one row per (user, vault
 * scope), so Open Vault and Personal Vault each have their own independent
 * PIN. Written by the app's own application user (client-credentials token).
 * Enabled only when DATAVERSE_VAULTPIN_TABLE is set; otherwise
 * store/vaultPin.ts (in-memory) is used instead. See data-table/vaultpin.csv
 * for the table's columns.
 */
const TABLE = process.env.DATAVERSE_VAULTPIN_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_VAULTPIN_PREFIX || 'cre2b_';
const ID_COL = process.env.DATAVERSE_VAULTPIN_ID_COL || `${P}vaultpinsid`;
const USERID_COL = process.env.DATAVERSE_VAULTPIN_USERID_COL || `${P}userid`;
const SCOPE_COL = process.env.DATAVERSE_VAULTPIN_SCOPE_COL || `${P}scope`;
const SALT_COL = process.env.DATAVERSE_VAULTPIN_SALT_COL || `${P}salt`;
const HASH_COL = process.env.DATAVERSE_VAULTPIN_HASH_COL || `${P}hash`;

export const vaultPinDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

interface DvPinRecord {
  id: string;
  salt: string;
  hash: string;
}

async function findRecord(userId: string, scope: VaultScope): Promise<DvPinRecord | undefined> {
  const url =
    `/${TABLE}?$select=${ID_COL},${SALT_COL},${HASH_COL}` +
    `&$filter=${USERID_COL} eq '${userId}' and ${SCOPE_COL} eq '${scope}'&$top=1`;
  const { data } = await client().get(url);
  const row = (data.value as DvRow[])[0];
  return row ? { id: row[ID_COL] as string, salt: row[SALT_COL] as string, hash: row[HASH_COL] as string } : undefined;
}

export async function dvHasPin(userId: string, scope: VaultScope): Promise<boolean> {
  return Boolean(await findRecord(userId, scope));
}

export async function dvSetPin(userId: string, scope: VaultScope, pin: string): Promise<void> {
  const salt = newSalt();
  const hash = hashPinToString(pin, salt);
  const existing = await findRecord(userId, scope);
  if (existing) {
    await client().patch(`/${TABLE}(${existing.id})`, { [SALT_COL]: salt, [HASH_COL]: hash });
  } else {
    await client().post(`/${TABLE}`, { [USERID_COL]: userId, [SCOPE_COL]: scope, [SALT_COL]: salt, [HASH_COL]: hash });
  }
}

export async function dvVerifyPin(userId: string, scope: VaultScope, pin: string): Promise<boolean> {
  const rec = await findRecord(userId, scope);
  if (!rec) return false;
  return pinMatches(pin, rec.salt, rec.hash);
}
