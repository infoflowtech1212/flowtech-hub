import type { QuickLink } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for App Links (Quick Links) — the app's own
 * application user (client-credentials token), so no per-employee Dataverse
 * license is needed. Same pattern as dataverse/vault.ts.
 *
 * The admin UI edits the list as a whole (add/remove/reorder, then one Save),
 * so dvSetQuickLinks replaces every row rather than diffing by id — simplest
 * match for that "whole list" editing model, and safe since nothing else
 * references these rows.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly. Logo
 * (a base64 data URI) needs "Multiple lines of text" — Single line of text's
 * 4000-char cap is too small for even a small image (see the Vault Pin hash
 * truncation issue for why this matters). See data-table/quicklinks.csv for
 * the columns this expects by default, pre-filled with the current links.
 *
 * Enabled only when DATAVERSE_QUICKLINK_TABLE is set; otherwise the app uses
 * the built-in in-memory store so App Links works out of the box.
 */
const TABLE = process.env.DATAVERSE_QUICKLINK_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_QUICKLINK_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_QUICKLINK_ID_COL || `${P}quicklinkid`;
const TITLE_COL = process.env.DATAVERSE_QUICKLINK_TITLE_COL || `${P}title`;
const URL_COL = process.env.DATAVERSE_QUICKLINK_URL_COL || `${P}url`;
const CATEGORY_COL = process.env.DATAVERSE_QUICKLINK_CATEGORY_COL || `${P}category`;
const ICON_COL = process.env.DATAVERSE_QUICKLINK_ICON_COL || `${P}icon`;
const LOGO_COL = process.env.DATAVERSE_QUICKLINK_LOGO_COL || `${P}logo`;
const SORTORDER_COL = process.env.DATAVERSE_QUICKLINK_SORTORDER_COL || `${P}sortorder`;

export const quickLinksDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, TITLE_COL, URL_COL, CATEGORY_COL, ICON_COL, LOGO_COL, SORTORDER_COL].join(',')}`;

const toDto = (r: DvRow): QuickLink => ({
  id: r[ID_COL] as string,
  label: (r[TITLE_COL] as string) ?? '',
  url: (r[URL_COL] as string) ?? '#',
  category: (r[CATEGORY_COL] as string | null) ?? undefined,
  icon: (r[ICON_COL] as string | null) ?? undefined,
  logo: (r[LOGO_COL] as string | null) ?? undefined,
});

export async function dvListQuickLinks(): Promise<QuickLink[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}&$orderby=${SORTORDER_COL} asc`);
  return (data.value as DvRow[]).map(toDto);
}

/** Replaces the whole list: deletes every existing row, then recreates in the given order. */
export async function dvSetQuickLinks(links: QuickLink[]): Promise<QuickLink[]> {
  const { data } = await client().get(`/${TABLE}?$select=${ID_COL}`);
  const existingIds = (data.value as DvRow[]).map((r) => r[ID_COL] as string);
  for (const id of existingIds) {
    await client().delete(`/${TABLE}(${id})`);
  }

  const created: QuickLink[] = [];
  for (const [index, link] of links.entries()) {
    const row: Record<string, unknown> = {
      [TITLE_COL]: link.label,
      [URL_COL]: link.url,
      [CATEGORY_COL]: link.category,
      [ICON_COL]: link.icon,
      [LOGO_COL]: link.logo,
      [SORTORDER_COL]: index,
    };
    const { data: createdRow } = await client().post(`/${TABLE}`, row);
    created.push(toDto(createdRow as DvRow));
  }
  return created;
}
