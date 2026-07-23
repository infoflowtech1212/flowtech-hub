import { randomUUID } from 'node:crypto';
import type { VaultEntry, VaultScope } from '@flowtech/shared';

/**
 * Password-vault store (dev/mock). The secret is WRITE-ONLY: it's held here but
 * NEVER returned by any read. This mock keeps it in memory only.
 *
 * SECURITY (prod): this is NOT a secure vault. A real deployment must encrypt
 * secrets at rest (e.g. Azure Key Vault / a KMS-encrypted column), enforce
 * per-entry access, and audit reveals. Do not store production passwords here.
 */
interface StoredEntry extends VaultEntry {
  /** Never serialized to the client. */
  _secret?: string;
}

let entries: StoredEntry[] = [
  {
    id: 'vt-001',
    title: 'Shared analytics dashboard',
    username: 'analytics@flowtechapps.com',
    url: 'https://analytics.example.com',
    category: 'Tools',
    scope: 'open',
    secretSet: true,
    _secret: 'mock',
    updatedDateTime: new Date(Date.now() - 10 * 864e5).toISOString(),
  },
];

const toDto = ({ _secret, ...rest }: StoredEntry): VaultEntry => rest;

/** Open entries are visible to all vault users; personal entries only to owner. */
export function listVault(scope: VaultScope, userId: string): VaultEntry[] {
  return entries
    .filter((e) => (scope === 'open' ? e.scope === 'open' : e.scope === 'personal' && e.ownerId === userId))
    .sort((a, b) => new Date(b.updatedDateTime).getTime() - new Date(a.updatedDateTime).getTime())
    .map(toDto);
}

export function createVaultEntry(input: {
  title: string;
  username?: string;
  url?: string;
  notes?: string;
  category?: string;
  scope: VaultScope;
  secret?: string;
  ownerId: string;
  ownerName: string;
}): VaultEntry {
  const { secret, ...meta } = input;
  const entry: StoredEntry = {
    id: `vt-${randomUUID().slice(0, 8)}`,
    ...meta,
    // Personal entries are always owned; open entries record who added them.
    ownerId: input.scope === 'personal' ? input.ownerId : input.ownerId,
    ownerName: input.ownerName,
    secretSet: Boolean(secret),
    _secret: secret,
    updatedDateTime: new Date().toISOString(),
  };
  entries.unshift(entry);
  return toDto(entry);
}

export function deleteVaultEntry(id: string, scope: VaultScope, userId: string): boolean {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return false;
  // A user can only delete their own personal entries; open entries need manage.
  if (scope === 'personal' && entry.ownerId !== userId) return false;
  entries = entries.filter((e) => e.id !== id);
  return true;
}
