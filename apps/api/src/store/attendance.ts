import { randomUUID } from 'node:crypto';
import type { AttendanceDaySummary, AttendanceRecord } from '@flowtech/shared';
import { listHolidays } from './holidays.js';

/**
 * Daily punch-in/punch-out records (dev/mock, in-memory). One record per
 * employee per day — enforced by getTodayRecord() before punchIn().
 * TODO(prod): Dataverse table so records persist across redeploys.
 */
let records: AttendanceRecord[] = [];

/** Local YYYY-MM-DD — not toISOString(), which is UTC and drifts near midnight. */
export const dateStr = (d: Date = new Date()): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const byDateDesc = (a: AttendanceRecord, b: AttendanceRecord) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export const getTodayRecord = (userId: string): AttendanceRecord | undefined =>
  records.find((r) => r.userId === userId && r.date === dateStr());

export function punchIn(userId: string, userName: string): AttendanceRecord {
  if (getTodayRecord(userId)) throw new Error('already_punched_in');
  const now = new Date().toISOString();
  const record: AttendanceRecord = {
    id: `att-${randomUUID().slice(0, 8)}`,
    userId,
    userName,
    date: dateStr(),
    checkIn: now,
    checkOut: null,
    status: 'present',
    completedTasks: [],
    tomorrowsPlan: '',
    createdDateTime: now,
    updatedDateTime: now,
  };
  records.unshift(record);
  return record;
}

export function punchOut(
  userId: string,
  eod: { completedTasks: string[]; tomorrowsPlan: string; blockers?: string },
): AttendanceRecord {
  const record = getTodayRecord(userId);
  if (!record) throw new Error('not_punched_in');
  if (record.checkOut) throw new Error('already_punched_out');
  const now = new Date().toISOString();
  Object.assign(record, eod, { checkOut: now, updatedDateTime: now });
  return { ...record };
}

/** Personal history, most recent first. */
export const listRecordsFor = (userId: string, from?: string, to?: string): AttendanceRecord[] =>
  records
    .filter((r) => r.userId === userId && (!from || r.date >= from) && (!to || r.date <= to))
    .sort(byDateDesc);

/**
 * Present/absent/weekend/holiday for every day in [from, to], given the dates
 * that already have a record. Pure — takes pre-fetched present dates so it
 * works the same whether they came from the in-memory store or Dataverse.
 */
export function buildCalendar(presentDateList: string[], from: string, to: string): AttendanceDaySummary[] {
  const holidayDates = new Set(listHolidays().map((h) => h.date));
  const presentDates = new Set(presentDateList);
  const today = dateStr();
  const out: AttendanceDaySummary[] = [];
  for (const d = new Date(`${from}T00:00:00`); dateStr(d) <= to; d.setDate(d.getDate() + 1)) {
    const key = dateStr(d);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    const status: AttendanceDaySummary['status'] = presentDates.has(key)
      ? 'present'
      : holidayDates.has(key)
        ? 'holiday'
        : dow === 0 || dow === 6
          ? 'weekend'
          : key >= today
            ? 'weekend' // never mark today-or-future as absent
            : 'absent';
    out.push({ date: key, status });
  }
  return out;
}

/** Present/absent/weekend/holiday for one user — in-memory store version. */
export const calendarFor = (userId: string, from: string, to: string): AttendanceDaySummary[] =>
  buildCalendar(
    listRecordsFor(userId, from, to).map((r) => r.date),
    from,
    to,
  );

// --- Admin (team-wide) -------------------------------------------------
export const listAllRecordsFor = (from?: string, to?: string): AttendanceRecord[] =>
  records.filter((r) => (!from || r.date >= from) && (!to || r.date <= to)).sort(byDateDesc);

export const listCurrentlyWorking = (): AttendanceRecord[] =>
  records.filter((r) => r.date === dateStr() && r.checkOut === null);

/** Seed demo data once at boot in mock mode — see routes/attendance.ts. */
export function seedAttendance(seedRecords: AttendanceRecord[]): void {
  records = [...seedRecords, ...records];
}
