import type { Holiday } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for company holidays — admin-managed,
 * shown on everyone's calendar. Same simple per-request pattern as
 * dataverse/quickNotes.ts (not the hot-path cache pattern used for
 * Roles/Grants, since this isn't read on every authenticated request).
 *
 * Enabled only when DATAVERSE_HOLIDAY_TABLE is set; otherwise the app uses
 * the built-in in-memory store, which is lost on every redeploy.
 */
// Defaults below match the live `ft_holidays` table (Power Platform admin
// center → FlowTech - L+M Asset Transitions → Tables → Holidays → Columns).
const TABLE = process.env.DATAVERSE_HOLIDAY_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_HOLIDAY_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_HOLIDAY_ID_COL || `${P}holidaysid`;
const NAME_COL = process.env.DATAVERSE_HOLIDAY_NAME_COL || `${P}holidayname`;
const DATE_COL = process.env.DATAVERSE_HOLIDAY_DATE_COL || `${P}date`;
const DESCRIPTION_COL = process.env.DATAVERSE_HOLIDAY_DESCRIPTION_COL || `${P}description`;

export const holidaysDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, NAME_COL, DATE_COL, DESCRIPTION_COL].join(',')}`;

// ft_Date is a "Date only" column — the Web API returns it as a full ISO
// datetime at UTC midnight (e.g. "2027-08-15T00:00:00Z"); keep just the date.
const toDateOnly = (v: unknown): string => String(v ?? '').slice(0, 10);

const toDto = (r: DvRow): Holiday => ({
  id: r[ID_COL] as string,
  name: (r[NAME_COL] as string) ?? '',
  date: toDateOnly(r[DATE_COL]),
  description: (r[DESCRIPTION_COL] as string | null) ?? undefined,
});

export async function dvListHolidays(): Promise<Holiday[]> {
  const url = `/${TABLE}?${SELECT}&$orderby=${DATE_COL} asc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateHoliday(input: {
  name: string;
  date: string;
  description?: string;
}): Promise<Holiday> {
  const row: Record<string, unknown> = {
    [NAME_COL]: input.name,
    [DATE_COL]: input.date,
    [DESCRIPTION_COL]: input.description,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteHoliday(id: string): Promise<void> {
  await client().delete(`/${TABLE}(${id})`);
}
