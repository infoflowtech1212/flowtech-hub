import type { PersonProfileSupplement } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for the "About you" profile supplement — one row
 * per user (LinkedIn / working hours / bio / DOB / joining-date overrides).
 * Written by the app's own application user (client-credentials token), same
 * find-then-patch-or-post pattern as dataverse/vaultPin.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/profiles.csv for a ready-to-import template).
 *
 * Enabled only when DATAVERSE_PROFILE_TABLE is set; otherwise the app uses
 * the built-in in-memory store, which is lost on every redeploy — that's the
 * "not persistent" symptom this table fixes.
 */
// Defaults below match the live `ft_profileses` table (Power Platform admin
// center → FlowTech - L+M Asset Transitions → Tables → Profiles → Columns).
// Entity set is "profileses", not "profiles" — Dataverse appends "es" when
// the schema name already ends in "s" (same as ft_requestses, ft_publicvaultses).
const TABLE = process.env.DATAVERSE_PROFILE_TABLE || 'ft_profileses'; // entity set (plural)
const P = process.env.DATAVERSE_PROFILE_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_PROFILE_ID_COL || `${P}profilesid`;
const USERID_COL = process.env.DATAVERSE_PROFILE_USERID_COL || `${P}employeeidentifier`;
const LINKEDIN_COL = process.env.DATAVERSE_PROFILE_LINKEDIN_COL || `${P}linkedinprofileurl`;
const WORKINGHOURS_COL = process.env.DATAVERSE_PROFILE_WORKINGHOURS_COL || `${P}workinghours`;
const BIO_COL = process.env.DATAVERSE_PROFILE_BIO_COL || `${P}biography`;
const BIRTHDAY_COL = process.env.DATAVERSE_PROFILE_BIRTHDAY_COL || `${P}dateofbirth`;
const HIREDATE_COL = process.env.DATAVERSE_PROFILE_HIREDATE_COL || `${P}hiredate`;

export const profilesDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, LINKEDIN_COL, WORKINGHOURS_COL, BIO_COL, BIRTHDAY_COL, HIREDATE_COL].join(',')}`;

const toDto = (r: DvRow): PersonProfileSupplement => ({
  linkedIn: (r[LINKEDIN_COL] as string | null) ?? undefined,
  workingHours: (r[WORKINGHOURS_COL] as string | null) ?? undefined,
  bio: (r[BIO_COL] as string | null) ?? undefined,
  birthday: (r[BIRTHDAY_COL] as string | null) ?? undefined,
  hireDate: (r[HIREDATE_COL] as string | null) ?? undefined,
});

async function findRow(userId: string): Promise<DvRow | undefined> {
  const url = `/${TABLE}?${SELECT}&$filter=${USERID_COL} eq '${userId}'&$top=1`;
  const { data } = await client().get(url);
  return (data.value as DvRow[])[0];
}

export async function dvGetProfile(userId: string): Promise<PersonProfileSupplement> {
  const row = await findRow(userId);
  return row ? toDto(row) : {};
}

export async function dvSetProfile(userId: string, patch: PersonProfileSupplement): Promise<PersonProfileSupplement> {
  // Store null (not '') for blanks so Dataverse actually clears the column
  // instead of writing an empty string that still shadows Microsoft data.
  const row: Record<string, unknown> = {
    [LINKEDIN_COL]: patch.linkedIn?.trim() || null,
    [WORKINGHOURS_COL]: patch.workingHours?.trim() || null,
    [BIO_COL]: patch.bio?.trim() || null,
    [BIRTHDAY_COL]: patch.birthday?.trim() || null,
    [HIREDATE_COL]: patch.hireDate?.trim() || null,
  };
  const existing = await findRow(userId);
  if (existing) {
    await client().patch(`/${TABLE}(${existing[ID_COL]})`, row);
  } else {
    await client().post(`/${TABLE}`, { [USERID_COL]: userId, ...row });
  }
  return dvGetProfile(userId);
}
