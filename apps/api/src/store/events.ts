import { randomUUID } from 'node:crypto';
import type { CalendarEvent } from '@flowtech/shared';

/**
 * Admin-posted company events, shown on everyone's calendar (source:
 * 'company'). Kept in memory for dev. TODO(prod): Dataverse, or a shared
 * Microsoft 365 calendar the BFF writes to.
 */
let events: CalendarEvent[] = [];

/** Company events overlapping [startIso, endIso] (both optional = all). */
export function listCompanyEvents(startIso?: string, endIso?: string): CalendarEvent[] {
  const start = startIso ? new Date(startIso).getTime() : -Infinity;
  const end = endIso ? new Date(endIso).getTime() : Infinity;
  return events
    .filter((e) => new Date(e.end).getTime() >= start && new Date(e.start).getTime() <= end)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function createCompanyEvent(input: {
  subject: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string;
}): CalendarEvent {
  const event: CalendarEvent = {
    id: `ce-${randomUUID().slice(0, 8)}`,
    subject: input.subject,
    start: input.start,
    end: input.end,
    isAllDay: Boolean(input.isAllDay),
    location: input.location,
    source: 'company',
  };
  events.unshift(event);
  return event;
}

export function deleteCompanyEvent(id: string): boolean {
  const before = events.length;
  events = events.filter((e) => e.id !== id);
  return events.length < before;
}
