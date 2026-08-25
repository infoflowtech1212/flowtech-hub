import type { CalendarEvent } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for company-wide calendar events — admin-posted,
 * shown on everyone's calendar (source: 'company'). Same simple per-request
 * pattern as dataverse/quickNotes.ts.
 *
 * This is the fallback for setups without a shared M365 mailbox — when
 * COMPANY_CALENDAR_MAILBOX is configured, that's used instead (a real
 * Outlook calendar; see graph/calendar.ts and companyEventsMode() in
 * routes/api.ts). Enabled only when DATAVERSE_COMPANYEVENT_TABLE is set;
 * otherwise the app uses the built-in in-memory store, which is lost on
 * every redeploy.
 */
// Defaults below match the live `ft_companyevents` table (Power Platform
// admin center → FlowTech - L+M Asset Transitions → Tables → Company Events → Columns).
const TABLE = process.env.DATAVERSE_COMPANYEVENT_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_COMPANYEVENT_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_COMPANYEVENT_ID_COL || `${P}companyeventsid`;
const SUBJECT_COL = process.env.DATAVERSE_COMPANYEVENT_SUBJECT_COL || `${P}subject`;
const START_COL = process.env.DATAVERSE_COMPANYEVENT_START_COL || `${P}start`;
const END_COL = process.env.DATAVERSE_COMPANYEVENT_END_COL || `${P}end`;
const ISALLDAY_COL = process.env.DATAVERSE_COMPANYEVENT_ISALLDAY_COL || `${P}isallday`;
const LOCATION_COL = process.env.DATAVERSE_COMPANYEVENT_LOCATION_COL || `${P}location`;

export const companyEventsDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[ID_COL, SUBJECT_COL, START_COL, END_COL, ISALLDAY_COL, LOCATION_COL].join(',')}`;

const toDto = (r: DvRow): CalendarEvent => ({
  id: r[ID_COL] as string,
  subject: (r[SUBJECT_COL] as string) ?? '',
  start: (r[START_COL] as string) ?? '',
  end: (r[END_COL] as string) ?? '',
  isAllDay: Boolean(r[ISALLDAY_COL]),
  location: (r[LOCATION_COL] as string | null) ?? undefined,
  source: 'company',
});

const overlaps = (e: CalendarEvent, startIso: string, endIso: string) =>
  new Date(e.end).getTime() >= new Date(startIso).getTime() &&
  new Date(e.start).getTime() <= new Date(endIso).getTime();

/** Company events overlapping [startIso, endIso] (both optional = all). Same
 *  signature/behavior as store/events.ts's listCompanyEvents. */
export async function dvListCompanyEvents(startIso?: string, endIso?: string): Promise<CalendarEvent[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}`);
  const items = (data.value as DvRow[]).map(toDto);
  const filtered = startIso && endIso ? items.filter((e) => overlaps(e, startIso, endIso)) : items;
  return filtered.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function dvCreateCompanyEvent(input: {
  subject: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string;
}): Promise<CalendarEvent> {
  const row: Record<string, unknown> = {
    [SUBJECT_COL]: input.subject,
    [START_COL]: input.start,
    [END_COL]: input.end,
    [ISALLDAY_COL]: Boolean(input.isAllDay),
    [LOCATION_COL]: input.location,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteCompanyEvent(id: string): Promise<void> {
  await client().delete(`/${TABLE}(${id})`);
}
