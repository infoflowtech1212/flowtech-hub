import type { AttendanceRecord } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for attendance records — the app's own
 * application user (client-credentials token), not per-signed-in-user, so no
 * employee needs an individual Dataverse license just to punch in/out. Same
 * pattern as dataverse/vault.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/attendance.csv for the columns this expects by default).
 *
 * Enabled only when DATAVERSE_ATTENDANCE_TABLE is set; otherwise the app uses
 * the built-in in-memory store so Attendance works out of the box.
 */
const TABLE = process.env.DATAVERSE_ATTENDANCE_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_ATTENDANCE_PREFIX || 'cre2b_';
const ID_COL = process.env.DATAVERSE_ATTENDANCE_ID_COL || `${P}attendanceid`;
const TITLE_COL = process.env.DATAVERSE_ATTENDANCE_TITLE_COL || `${P}recordtitle`;
const USERID_COL = process.env.DATAVERSE_ATTENDANCE_USERID_COL || `${P}userid`;
const USERNAME_COL = process.env.DATAVERSE_ATTENDANCE_USERNAME_COL || `${P}username`;
const DATE_COL = process.env.DATAVERSE_ATTENDANCE_DATE_COL || `${P}date`;
const CHECKIN_COL = process.env.DATAVERSE_ATTENDANCE_CHECKIN_COL || `${P}checkin`;
const CHECKOUT_COL = process.env.DATAVERSE_ATTENDANCE_CHECKOUT_COL || `${P}checkout`;
const COMPLETEDTASKS_COL = process.env.DATAVERSE_ATTENDANCE_COMPLETEDTASKS_COL || `${P}completedtasks`;
const TOMORROWSPLAN_COL = process.env.DATAVERSE_ATTENDANCE_TOMORROWSPLAN_COL || `${P}tomorrowsplan`;
const BLOCKERS_COL = process.env.DATAVERSE_ATTENDANCE_BLOCKERS_COL || `${P}blockers`;

export const attendanceDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  USERID_COL,
  USERNAME_COL,
  DATE_COL,
  CHECKIN_COL,
  CHECKOUT_COL,
  COMPLETEDTASKS_COL,
  TOMORROWSPLAN_COL,
  BLOCKERS_COL,
].join(',')},createdon,modifiedon`;

// If DATE_COL is a native DateTime/Date-only column (not Text), Dataverse
// returns e.g. "2026-08-19T00:00:00Z" — take just the date portion so it
// still matches store.dateStr()'s plain "YYYY-MM-DD" used everywhere else.
const dateOnly = (v?: string) => (v ?? '').slice(0, 10);

const toDto = (r: DvRow): AttendanceRecord => ({
  id: r[ID_COL] as string,
  userId: r[USERID_COL] as string,
  userName: (r[USERNAME_COL] as string) ?? '',
  date: dateOnly(r[DATE_COL] as string | undefined),
  checkIn: (r[CHECKIN_COL] as string) ?? '',
  checkOut: (r[CHECKOUT_COL] as string | null) ?? null,
  status: 'present',
  completedTasks: ((r[COMPLETEDTASKS_COL] as string | null) ?? '').split('\n').filter(Boolean),
  tomorrowsPlan: (r[TOMORROWSPLAN_COL] as string | null) ?? '',
  blockers: (r[BLOCKERS_COL] as string | null) || undefined,
  createdDateTime: (r.createdon as string) ?? '',
  updatedDateTime: (r.modifiedon as string) ?? '',
});

// DATE_COL is a native DateTime column here, so its OData literal is
// unquoted (verified against the live table) — unlike the userId string
// filter, which needs quotes.
export async function dvGetTodayRecord(userId: string, date: string): Promise<AttendanceRecord | undefined> {
  const url = `/${TABLE}?${SELECT}&$filter=${USERID_COL} eq '${userId}' and ${DATE_COL} eq ${date}&$top=1`;
  const { data } = await client().get(url);
  const row = (data.value as DvRow[])[0];
  return row ? toDto(row) : undefined;
}

export async function dvPunchIn(userId: string, userName: string, date: string): Promise<AttendanceRecord> {
  const row: Record<string, unknown> = {
    [TITLE_COL]: `${userName} — ${date}`,
    [USERID_COL]: userId,
    [USERNAME_COL]: userName,
    [DATE_COL]: date,
    [CHECKIN_COL]: new Date().toISOString(),
    [COMPLETEDTASKS_COL]: '',
    [TOMORROWSPLAN_COL]: '',
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

export async function dvPunchOut(
  id: string,
  eod: { completedTasks: string[]; tomorrowsPlan: string; blockers?: string },
): Promise<AttendanceRecord> {
  const row: Record<string, unknown> = {
    [CHECKOUT_COL]: new Date().toISOString(),
    [COMPLETEDTASKS_COL]: eod.completedTasks.join('\n'),
    [TOMORROWSPLAN_COL]: eod.tomorrowsPlan,
    [BLOCKERS_COL]: eod.blockers ?? '',
  };
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

/** Personal history, most recent first. */
export async function dvListRecordsFor(userId: string, from?: string, to?: string): Promise<AttendanceRecord[]> {
  const filters = [`${USERID_COL} eq '${userId}'`];
  if (from) filters.push(`${DATE_COL} ge ${from}`);
  if (to) filters.push(`${DATE_COL} le ${to}`);
  const url = `/${TABLE}?${SELECT}&$filter=${filters.join(' and ')}&$orderby=${DATE_COL} desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

/** Admin, team-wide — every record, no user scoping. */
export async function dvListAllRecordsFor(from?: string, to?: string): Promise<AttendanceRecord[]> {
  const filters: string[] = [];
  if (from) filters.push(`${DATE_COL} ge ${from}`);
  if (to) filters.push(`${DATE_COL} le ${to}`);
  const filter = filters.length ? `&$filter=${filters.join(' and ')}` : '';
  const url = `/${TABLE}?${SELECT}${filter}&$orderby=${DATE_COL} desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvListCurrentlyWorking(date: string): Promise<AttendanceRecord[]> {
  const url = `/${TABLE}?${SELECT}&$filter=${DATE_COL} eq ${date} and ${CHECKOUT_COL} eq null`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}
