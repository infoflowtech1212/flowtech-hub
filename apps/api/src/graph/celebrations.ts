import type { Celebration, Celebrations } from '@flowtech/shared';
import type { AuthContext } from '../auth/middleware.js';
import { graphClientFor } from './client.js';

const WINDOW_DAYS = 60; // look ahead this far
const MAX_PER_KIND = 6;

interface PersonRecord {
  id: string;
  name: string;
  jobTitle?: string;
  department?: string;
  /** ISO date the person was born (year may be a placeholder). */
  birthday?: string;
  /** ISO date the person joined (hire date, or account creation as a fallback). */
  start?: string;
}

const dateOnlyUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Next occurrence of a given month/day within the window, from `from`. */
function nextOccurrence(
  iso: string,
  from: Date,
  windowDays: number,
): { date: string; daysUntil: number; sourceYear: number; occYear: number } | null {
  const src = new Date(iso);
  if (Number.isNaN(src.getTime())) return null;
  const sourceYear = src.getUTCFullYear();
  if (sourceYear <= 1) return null; // placeholder / unset dates (e.g. 0001-01-01)

  const month = src.getUTCMonth();
  const day = src.getUTCDate();
  const fromDate = dateOnlyUtc(from);
  let occ = new Date(Date.UTC(fromDate.getUTCFullYear(), month, day));
  if (occ < fromDate) occ = new Date(Date.UTC(fromDate.getUTCFullYear() + 1, month, day));

  const daysUntil = Math.round((occ.getTime() - fromDate.getTime()) / 864e5);
  if (daysUntil < 0 || daysUntil > windowDays) return null;
  return { date: occ.toISOString().slice(0, 10), daysUntil, sourceYear, occYear: occ.getUTCFullYear() };
}

/** Pure: turn people records into upcoming birthdays + work anniversaries. */
export function computeCelebrations(people: PersonRecord[], now = new Date(), windowDays = WINDOW_DAYS): Celebrations {
  const birthdays: Celebration[] = [];
  const workAnniversaries: Celebration[] = [];

  for (const p of people) {
    if (p.birthday) {
      const o = nextOccurrence(p.birthday, now, windowDays);
      if (o) {
        birthdays.push({
          id: `bd-${p.id}`,
          personName: p.name,
          jobTitle: p.jobTitle,
          department: p.department,
          kind: 'birthday',
          date: o.date,
          daysUntil: o.daysUntil,
        });
      }
    }
    if (p.start) {
      const o = nextOccurrence(p.start, now, windowDays);
      const years = o ? o.occYear - o.sourceYear : 0;
      if (o && years >= 1) {
        workAnniversaries.push({
          id: `wa-${p.id}`,
          personName: p.name,
          jobTitle: p.jobTitle,
          department: p.department,
          kind: 'work-anniversary',
          date: o.date,
          daysUntil: o.daysUntil,
          years,
        });
      }
    }
  }

  const bySoonest = (a: Celebration, b: Celebration) => a.daysUntil - b.daysUntil;
  return {
    birthdays: birthdays.sort(bySoonest).slice(0, MAX_PER_KIND),
    workAnniversaries: workAnniversaries.sort(bySoonest).slice(0, MAX_PER_KIND),
  };
}

interface GraphUser {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  birthday?: string;
  employeeHireDate?: string;
  createdDateTime?: string;
  accountEnabled?: boolean;
  userType?: string;
}

/**
 * Live celebrations from Entra. `birthday` and `employeeHireDate` are HR fields
 * that are often empty; when a hire date is missing we fall back to the account
 * creation date so work anniversaries still surface. Fields that need elevated
 * scopes degrade gracefully to empty rather than failing the dashboard.
 */
const BASE_SELECT = ['id', 'displayName', 'userPrincipalName', 'jobTitle', 'department', 'accountEnabled', 'userType', 'createdDateTime'];
const HR_SELECT = [...BASE_SELECT, 'birthday', 'employeeHireDate'];

export async function getCelebrations(auth: AuthContext): Promise<Celebrations> {
  const client = graphClientFor(auth.getGraphToken);
  // HR/date properties don't combine with Graph's advanced query ($count +
  // eventual + $filter), so fetch plainly and filter active members in code —
  // the same pattern getOrgPeople uses. If the HR fields (birthday /
  // employeeHireDate) aren't available on this tenant, fall back to a minimal
  // select so work anniversaries still surface from the account creation date.
  const fetchUsers = (select: string[]) => client.api('/users').select(select).top(999).get();
  let page: { value: GraphUser[] };
  try {
    page = await fetchUsers(HR_SELECT);
  } catch {
    page = await fetchUsers(BASE_SELECT);
  }

  const people: PersonRecord[] = (page.value as GraphUser[])
    .filter((u) => u.accountEnabled !== false && u.userType !== 'Guest')
    .map((u) => ({
      id: u.id,
      name: u.displayName ?? u.userPrincipalName ?? 'Unknown',
      jobTitle: u.jobTitle,
      department: u.department,
      birthday: u.birthday,
      start: u.employeeHireDate ?? u.createdDateTime,
    }));

  return computeCelebrations(people);
}
