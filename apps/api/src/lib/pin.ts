import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * scrypt hash + random salt for PIN-style secrets — never store the raw
 * value. Encoded as base64 (not hex): a 64-byte hash is ~88 base64 chars vs
 * 128 hex chars, keeping it under Dataverse's default 100-char text-column
 * limit without needing a widened column.
 */
export const newSalt = (): string => randomBytes(16).toString('base64');

const hashPin = (pin: string, salt: string): Buffer => scryptSync(pin, salt, 64);

export const hashPinToString = (pin: string, salt: string): string => hashPin(pin, salt).toString('base64');

export function pinMatches(pin: string, salt: string, storedHash: string): boolean {
  const attempt = hashPin(pin, salt);
  const stored = Buffer.from(storedHash, 'base64');
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}
