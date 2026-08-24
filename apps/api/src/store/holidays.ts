import { randomUUID } from 'node:crypto';
import type { Holiday } from '@flowtech/shared';

/**
 * Company holidays (dev/mock). Admin-managed; shown on everyone's calendar.
 * TODO(prod): Dataverse table (or a SharePoint list) so they persist.
 */
let holidays: Holiday[] = [
  { id: 'hol-001', name: 'Independence Day', date: '2027-08-15' },
  { id: 'hol-002', name: 'Gandhi Jayanti', date: '2026-10-02' },
  { id: 'hol-003', name: 'Diwali', date: '2026-11-08' },
  { id: 'hol-004', name: 'Christmas', date: '2026-12-25' },
];

export const listHolidays = (): Holiday[] =>
  [...holidays].sort((a, b) => a.date.localeCompare(b.date));

export function createHoliday(input: { name: string; date: string; description?: string }): Holiday {
  const holiday: Holiday = { id: `hol-${randomUUID().slice(0, 8)}`, ...input };
  holidays.push(holiday);
  return holiday;
}

export function deleteHoliday(id: string): boolean {
  const before = holidays.length;
  holidays = holidays.filter((h) => h.id !== id);
  return holidays.length < before;
}
