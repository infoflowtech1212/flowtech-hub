import type { VaultScope } from '@flowtech/shared';
import { hashPinToString, newSalt, pinMatches } from '../lib/pin.js';

/**
 * Per-user, per-vault PIN — a second security layer over the password vaults
 * (dev/mock only; in-memory, resets on restart). Open Vault and Personal
 * Vault each have their own independent PIN, keyed by user + scope. Live
 * sessions use dataverse/vaultPin.ts instead when DATAVERSE_VAULTPIN_TABLE is
 * set — see useLocalPinStore in routes/intranet.ts.
 */
interface PinRecord {
  salt: string;
  hash: string;
}
const pins = new Map<string, PinRecord>();

const key = (userId: string, scope: VaultScope) => `${userId}:${scope}`;

export const hasPin = (userId: string, scope: VaultScope): boolean => pins.has(key(userId, scope));

export function setPin(userId: string, scope: VaultScope, pin: string): void {
  const salt = newSalt();
  pins.set(key(userId, scope), { salt, hash: hashPinToString(pin, salt) });
}

export function verifyPin(userId: string, scope: VaultScope, pin: string): boolean {
  const rec = pins.get(key(userId, scope));
  if (!rec) return false;
  return pinMatches(pin, rec.salt, rec.hash);
}
