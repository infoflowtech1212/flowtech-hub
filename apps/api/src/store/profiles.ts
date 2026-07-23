import type { PersonProfileSupplement } from '@flowtech/shared';

/**
 * Hub-managed supplement to a person's Microsoft profile (LinkedIn, working
 * hours, bio, and admin overrides for DOB / joining date when Microsoft is
 * blank). Keyed by the user's Entra object id. Admins edit these in the admin
 * panel. TODO(prod): back with a Dataverse table (text → Dataverse).
 */
const store = new Map<string, PersonProfileSupplement>();

export const getProfileSupplement = (userId: string): PersonProfileSupplement =>
  store.get(userId) ?? {};

export function setProfileSupplement(userId: string, patch: PersonProfileSupplement): PersonProfileSupplement {
  const clean: PersonProfileSupplement = {};
  // Store only non-empty values so empties don't shadow Microsoft data.
  for (const k of ['linkedIn', 'workingHours', 'bio', 'birthday', 'hireDate'] as const) {
    const v = patch[k]?.trim();
    if (v) clean[k] = v;
  }
  store.set(userId, clean);
  return clean;
}
