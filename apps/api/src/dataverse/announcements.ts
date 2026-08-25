import type { Announcement } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for company Announcements — a team-wide list
 * (no per-owner scoping; every employee with announcements.view sees every
 * row). Written by the app's own application user (client-credentials
 * token), so no per-employee Dataverse license is needed. Same pattern as
 * dataverse/vault.ts.
 *
 * Defaults below match the live `ft_announcements` table (Power Platform
 * admin center → FlowTech - L+M Asset Transitions → Tables → Announcement → Columns).
 * Every column is individually overridable via env (see
 * data-table/announcements.csv for a ready-to-import template).
 *
 * Two schema quirks on the live table:
 *  - PINNED_COL is Single line of text, not Boolean — stored/read as the
 *    literal strings "true"/"false", not a native Yes/No value.
 *  - IMAGEURL_COL points at `ft_bannerimage` (Multiple lines of text), not
 *    the table's own `ft_imageurl` (Single line of text, hard-capped at
 *    4,000 chars by Dataverse — nowhere near enough for an uploaded image's
 *    base64 data URI). `ft_imageurl` still works fine for a pasted external
 *    image link; `ft_bannerimage` is what actually holds uploads.
 *
 * Enabled only when DATAVERSE_ANNOUNCEMENT_TABLE is set; otherwise the app
 * uses the built-in in-memory store, which is lost on every redeploy.
 */
const TABLE = process.env.DATAVERSE_ANNOUNCEMENT_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_ANNOUNCEMENT_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_ANNOUNCEMENT_ID_COL || `${P}announcementid`;
const TITLE_COL = process.env.DATAVERSE_ANNOUNCEMENT_TITLE_COL || `${P}announcementtitle`;
const BODY_COL = process.env.DATAVERSE_ANNOUNCEMENT_BODY_COL || `${P}announcementbody`;
const AUTHOR_COL = process.env.DATAVERSE_ANNOUNCEMENT_AUTHOR_COL || `${P}authorname`;
const CATEGORY_COL = process.env.DATAVERSE_ANNOUNCEMENT_CATEGORY_COL || `${P}announcementcategory`;
const PINNED_COL = process.env.DATAVERSE_ANNOUNCEMENT_PINNED_COL || `${P}ispinned`;
const IMAGEURL_COL = process.env.DATAVERSE_ANNOUNCEMENT_IMAGEURL_COL || `${P}bannerimage`;

export const announcementDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  TITLE_COL,
  BODY_COL,
  AUTHOR_COL,
  CATEGORY_COL,
  PINNED_COL,
  IMAGEURL_COL,
].join(',')},createdon`;

const toDto = (r: DvRow): Announcement => ({
  id: r[ID_COL] as string,
  title: (r[TITLE_COL] as string) ?? '',
  body: (r[BODY_COL] as string) ?? '',
  author: (r[AUTHOR_COL] as string) ?? '',
  publishedDateTime: (r.createdon as string) ?? '',
  category: (r[CATEGORY_COL] as string | null) ?? undefined,
  pinned: r[PINNED_COL] === 'true',
  imageUrl: (r[IMAGEURL_COL] as string | null) ?? undefined,
});

export async function dvListAnnouncements(): Promise<Announcement[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}&$orderby=${PINNED_COL} desc,createdon desc`);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateAnnouncement(input: {
  title: string;
  body: string;
  author: string;
  category?: string;
  pinned?: boolean;
  imageUrl?: string;
}): Promise<Announcement> {
  const row: Record<string, unknown> = {
    [TITLE_COL]: input.title,
    [BODY_COL]: input.body,
    [AUTHOR_COL]: input.author,
    [CATEGORY_COL]: input.category,
    [PINNED_COL]: String(input.pinned ?? false),
    [IMAGEURL_COL]: input.imageUrl,
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

export async function dvUpdateAnnouncement(
  id: string,
  patch: Partial<Pick<Announcement, 'title' | 'body' | 'category' | 'pinned' | 'imageUrl'>>,
): Promise<Announcement> {
  await assertExists(id);
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row[TITLE_COL] = patch.title;
  if (patch.body !== undefined) row[BODY_COL] = patch.body;
  if (patch.category !== undefined) row[CATEGORY_COL] = patch.category;
  if (patch.pinned !== undefined) row[PINNED_COL] = String(patch.pinned);
  if (patch.imageUrl !== undefined) row[IMAGEURL_COL] = patch.imageUrl;
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteAnnouncement(id: string): Promise<void> {
  await assertExists(id);
  await client().delete(`/${TABLE}(${id})`);
}
