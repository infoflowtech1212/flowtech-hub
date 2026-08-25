import type { VaultEntry, VaultScope } from '@flowtech/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for the Password Vault — the app's own
 * application user (client-credentials token), so no per-employee Dataverse
 * license is needed. Dataverse is the source of truth when configured; the
 * in-memory store (store/vault.ts) is only used in mock mode.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly.
 *
 * SECURITY: the secret is stored here — use an encrypted column or a Key Vault
 * reference in production; restrict the table's security role tightly.
 */
const TABLE = process.env.DATAVERSE_VAULT_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_VAULT_PREFIX || 'cre2b_'; // column prefix
const ID_COL = process.env.DATAVERSE_VAULT_ID_COL || `${P}publicvaultsid`;
const TITLE_COL = process.env.DATAVERSE_VAULT_TITLE_COL || `${P}title`;
const USERNAME_COL = process.env.DATAVERSE_VAULT_USERNAME_COL || `${P}username`;
const URL_COL = process.env.DATAVERSE_VAULT_URL_COL || `${P}url`;
const NOTES_COL = process.env.DATAVERSE_VAULT_NOTES_COL || `${P}notes`;
const CATEGORY_COL = process.env.DATAVERSE_VAULT_CATEGORY_COL || `${P}category`;
const SCOPE_COL = process.env.DATAVERSE_VAULT_SCOPE_COL || `${P}newscope`;
const SECRET_COL = process.env.DATAVERSE_VAULT_SECRET_COL || `${P}secret`;
const ADDEDBYID_COL = process.env.DATAVERSE_VAULT_ADDEDBYID_COL || `${P}addedbyid`;
const ADDEDBYNAME_COL = process.env.DATAVERSE_VAULT_ADDEDBYNAME_COL || `${P}addedbyname`;

export function vaultDataverseEnabled(): boolean {
  return Boolean(config.dataverse.url && TABLE);
}

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  TITLE_COL,
  USERNAME_COL,
  URL_COL,
  NOTES_COL,
  CATEGORY_COL,
  SCOPE_COL,
  SECRET_COL,
  ADDEDBYID_COL,
  ADDEDBYNAME_COL,
].join(',')},createdon,modifiedon`;

const toDto = (r: DvRow): VaultEntry => ({
  id: r[ID_COL] as string,
  title: (r[TITLE_COL] as string) ?? '',
  username: (r[USERNAME_COL] as string | null) ?? undefined,
  url: (r[URL_COL] as string | null) ?? undefined,
  notes: (r[NOTES_COL] as string | null) ?? undefined,
  category: (r[CATEGORY_COL] as string | null) ?? undefined,
  scope: r[SCOPE_COL] as VaultScope,
  ownerId: (r[ADDEDBYID_COL] as string | null) ?? undefined,
  ownerName: (r[ADDEDBYNAME_COL] as string | null) ?? undefined,
  secretSet: Boolean(r[SECRET_COL]),
  updatedDateTime: (r.modifiedon as string) ?? (r.createdon as string) ?? new Date().toISOString(),
});

/** Open entries are visible to everyone; personal entries only to their owner. */
export async function dvListVault(scope: VaultScope, userId: string): Promise<VaultEntry[]> {
  const filters = [`${SCOPE_COL} eq '${scope}'`];
  if (scope === 'personal') filters.push(`${ADDEDBYID_COL} eq '${userId}'`);
  const url = `/${TABLE}?${SELECT}&$filter=${filters.join(' and ')}&$orderby=modifiedon desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
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
}): Promise<VaultEntry> {
  const row: Record<string, unknown> = {
    [TITLE_COL]: entry.title,
    [USERNAME_COL]: entry.username,
    [URL_COL]: entry.url,
    [NOTES_COL]: entry.notes,
    [CATEGORY_COL]: entry.category,
    [SCOPE_COL]: entry.scope,
    [SECRET_COL]: entry.secret,
    [ADDEDBYID_COL]: entry.addedById,
    [ADDEDBYNAME_COL]: entry.addedByName,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  logger.info({ scope: entry.scope, title: entry.title }, 'vault entry written to Dataverse');
  return toDto(data as DvRow);
}

/** Personal entries can only be touched by their owner; open entries need no per-row check (gated by vault.manage at the route). */
async function assertOwnedIfPersonal(id: string, scope: VaultScope, userId: string): Promise<void> {
  if (scope !== 'personal') return;
  const url = `/${TABLE}?$select=${ID_COL}&$filter=${ID_COL} eq ${id} and ${ADDEDBYID_COL} eq '${userId}'&$top=1`;
  const { data } = await client().get(url);
  if (!(data.value as DvRow[])[0]) throw new Error('not_found_or_forbidden');
}

export async function dvUpdateVaultRow(
  id: string,
  scope: VaultScope,
  userId: string,
  updates: { title?: string; username?: string; url?: string; notes?: string; category?: string; secret?: string },
): Promise<VaultEntry> {
  await assertOwnedIfPersonal(id, scope, userId);
  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row[TITLE_COL] = updates.title;
  if (updates.username !== undefined) row[USERNAME_COL] = updates.username;
  if (updates.url !== undefined) row[URL_COL] = updates.url;
  if (updates.notes !== undefined) row[NOTES_COL] = updates.notes;
  if (updates.category !== undefined) row[CATEGORY_COL] = updates.category;
  if (updates.secret) row[SECRET_COL] = updates.secret; // only replace when a new one is actually provided
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteVaultRow(id: string, scope: VaultScope, userId: string): Promise<void> {
  await assertOwnedIfPersonal(id, scope, userId);
  await client().delete(`/${TABLE}(${id})`);
}
