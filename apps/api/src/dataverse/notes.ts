import type { AdminNote } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for the Admin Notes / ideas board — a team-wide
 * list (visible to every admin, not per-author scoped). Written by the app's
 * own application user (client-credentials token), so no per-employee
 * Dataverse license is needed. Same pattern as dataverse/vault.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/notes.csv for a ready-to-import template).
 *
 * Enabled only when DATAVERSE_NOTE_TABLE is set; otherwise the app uses the
 * built-in in-memory store, which is lost on every redeploy.
 */
// Defaults below match the live `ft_adminnoteses` table (Power Platform
// admin center → FlowTech - L+M Asset Transitions → Tables → Admin Notes → Columns).
const TABLE = process.env.DATAVERSE_NOTE_TABLE || 'ft_adminnoteses'; // entity set (plural)
const P = process.env.DATAVERSE_NOTE_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_NOTE_ID_COL || `${P}adminnotesid`;
const TITLE_COL = process.env.DATAVERSE_NOTE_TITLE_COL || `${P}updatetitle`;
const BODY_COL = process.env.DATAVERSE_NOTE_BODY_COL || `${P}updatebody`;
const AUTHORID_COL = process.env.DATAVERSE_NOTE_AUTHORID_COL || `${P}authoridentifier`;
const AUTHORNAME_COL = process.env.DATAVERSE_NOTE_AUTHORNAME_COL || `${P}authorname`;
const PINNED_COL = process.env.DATAVERSE_NOTE_PINNED_COL || `${P}ispinned`;

export const noteDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, TITLE_COL, BODY_COL, AUTHORID_COL, AUTHORNAME_COL, PINNED_COL].join(',')},createdon,modifiedon`;

const toDto = (r: DvRow): AdminNote => ({
  id: r[ID_COL] as string,
  title: (r[TITLE_COL] as string) ?? '',
  body: (r[BODY_COL] as string) ?? '',
  authorId: (r[AUTHORID_COL] as string) ?? '',
  authorName: (r[AUTHORNAME_COL] as string) ?? '',
  pinned: Boolean(r[PINNED_COL]),
  createdDateTime: (r.createdon as string) ?? '',
  updatedDateTime: (r.modifiedon as string) ?? (r.createdon as string) ?? '',
});

export async function dvListNotes(): Promise<AdminNote[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}&$orderby=${PINNED_COL} desc,modifiedon desc`);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateNote(input: {
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  pinned?: boolean;
}): Promise<AdminNote> {
  const row: Record<string, unknown> = {
    [TITLE_COL]: input.title,
    [BODY_COL]: input.body,
    [AUTHORID_COL]: input.authorId,
    [AUTHORNAME_COL]: input.authorName,
    [PINNED_COL]: input.pinned ?? false,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

/** Pre-check so a stale/missing id maps to a clean 404 at the route instead of a raw Dataverse error. */
async function assertExists(id: string): Promise<void> {
  const url = `/${TABLE}?$select=${ID_COL}&$filter=${ID_COL} eq ${id}&$top=1`;
  const { data } = await client().get(url);
  if (!(data.value as DvRow[])[0]) throw new Error('not_found');
}

export async function dvUpdateNote(
  id: string,
  patch: Partial<Pick<AdminNote, 'title' | 'body' | 'pinned'>>,
): Promise<AdminNote> {
  await assertExists(id);
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row[TITLE_COL] = patch.title;
  if (patch.body !== undefined) row[BODY_COL] = patch.body;
  if (patch.pinned !== undefined) row[PINNED_COL] = patch.pinned;
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteNote(id: string): Promise<void> {
  await assertExists(id);
  await client().delete(`/${TABLE}(${id})`);
}
