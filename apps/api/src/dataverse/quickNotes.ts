import type { QuickNote, QuickNoteColor } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for Quick Notes — private per-employee sticky
 * notes. Written by the app's own application user (client-credentials
 * token), so no per-employee Dataverse license is needed. Same pattern as
 * dataverse/vault.ts, minus the open/personal scope split (every note is
 * private to its owner).
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/quicknotes.csv for a ready-to-import template).
 *
 * Enabled only when DATAVERSE_QUICKNOTE_TABLE is set; otherwise the app uses
 * the built-in in-memory store, which is lost on every redeploy.
 */
// Defaults below match the live `ft_notes` table (Power Platform admin
// center → FlowTech - L+M Asset Transitions → Tables → Note → Columns).
const TABLE = process.env.DATAVERSE_QUICKNOTE_TABLE || 'ft_notes'; // entity set (plural)
const P = process.env.DATAVERSE_QUICKNOTE_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_QUICKNOTE_ID_COL || `${P}noteid`;
const TITLE_COL = process.env.DATAVERSE_QUICKNOTE_TITLE_COL || `${P}notetitle`;
const BODY_COL = process.env.DATAVERSE_QUICKNOTE_BODY_COL || `${P}notebody`;
const COLOR_COL = process.env.DATAVERSE_QUICKNOTE_COLOR_COL || `${P}notecolor`;
const OWNERID_COL = process.env.DATAVERSE_QUICKNOTE_OWNERID_COL || `${P}owneridentifier`;

export const quickNotesDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, TITLE_COL, BODY_COL, COLOR_COL, OWNERID_COL].join(',')},createdon,modifiedon`;

const toDto = (r: DvRow): QuickNote => ({
  id: r[ID_COL] as string,
  title: (r[TITLE_COL] as string | null) ?? undefined,
  body: (r[BODY_COL] as string) ?? '',
  color: ((r[COLOR_COL] as QuickNoteColor | null) ?? 'default') as QuickNoteColor,
  createdDateTime: (r.createdon as string) ?? '',
  updatedDateTime: (r.modifiedon as string) ?? (r.createdon as string) ?? '',
});

export async function dvListQuickNotes(ownerId: string): Promise<QuickNote[]> {
  const url = `/${TABLE}?${SELECT}&$filter=${OWNERID_COL} eq '${ownerId}'&$orderby=modifiedon desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateQuickNote(
  ownerId: string,
  input: { title?: string; body: string; color?: QuickNoteColor },
): Promise<QuickNote> {
  const row: Record<string, unknown> = {
    [TITLE_COL]: input.title,
    [BODY_COL]: input.body,
    [COLOR_COL]: input.color ?? 'default',
    [OWNERID_COL]: ownerId,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

/** Notes are private — only the owner may touch their own row. */
async function assertOwned(id: string, ownerId: string): Promise<void> {
  const url = `/${TABLE}?$select=${ID_COL}&$filter=${ID_COL} eq ${id} and ${OWNERID_COL} eq '${ownerId}'&$top=1`;
  const { data } = await client().get(url);
  if (!(data.value as DvRow[])[0]) throw new Error('not_found_or_forbidden');
}

export async function dvUpdateQuickNote(
  ownerId: string,
  id: string,
  patch: { title?: string; body?: string; color?: QuickNoteColor },
): Promise<QuickNote> {
  await assertOwned(id, ownerId);
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row[TITLE_COL] = patch.title;
  if (patch.body !== undefined) row[BODY_COL] = patch.body;
  if (patch.color !== undefined) row[COLOR_COL] = patch.color;
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteQuickNote(ownerId: string, id: string): Promise<void> {
  await assertOwned(id, ownerId);
  await client().delete(`/${TABLE}(${id})`);
}
