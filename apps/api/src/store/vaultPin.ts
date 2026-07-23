import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Per-user vault PIN — a second security layer over the password vaults. The
 * PIN is never stored in plain text: we keep a scrypt hash + random salt and
 * compare in constant time. Keyed by the user's id. TODO(prod): persist the
 * hash in Dataverse / a secrets store, add lockout after repeated failures.
 */
interface PinRecord {
  salt: string;
  hash: string;
}
const pins = new Map<string, PinRecord>();

const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 64);

export const hasPin = (userId: string): boolean => pins.has(userId);

export function setPin(userId: string, pin: string): void {
  const salt = randomBytes(16).toString('hex');
  pins.set(userId, { salt, hash: hashPin(pin, salt).toString('hex') });
}

export function verifyPin(userId: string, pin: string): boolean {
  const rec = pins.get(userId);
  if (!rec) return false;
  const attempt = hashPin(pin, rec.salt);
  const stored = Buffer.from(rec.hash, 'hex');
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}
