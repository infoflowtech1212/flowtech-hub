import type { CalendarEvent, Paged } from '@flowtech/shared';
import { config } from '../config.js';
import type { AuthContext } from '../auth/middleware.js';
import { graphClientFor } from './client.js';

interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isAllDay?: boolean;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string } };
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
}

const SELECT = [
  'id',
  'subject',
  'bodyPreview',
  'isAllDay',
  'start',
  'end',
  'location',
  'organizer',
  'onlineMeeting',
  'onlineMeetingUrl',
];

// We request events in UTC (Prefer header), but Graph returns the dateTime
// WITHOUT a trailing 'Z'. Add it so the client parses it as UTC and renders /
// buckets in the viewer's local timezone correctly (otherwise a Z-less string
// is read as local time, shifting evening events onto the wrong day for
// non-UTC users).
const asUtcIso = (dt: string) => (/[Z+]|-\d{2}:\d{2}$/.test(dt) ? dt : `${dt}Z`);

function toEvent(e: GraphEvent, source: CalendarEvent['source']): CalendarEvent {
  return {
    id: e.id,
    subject: e.subject ?? '(No subject)',
    start: asUtcIso(e.start.dateTime),
    end: asUtcIso(e.end.dateTime),
    isAllDay: Boolean(e.isAllDay),
    location: e.location?.displayName || undefined,
    organizer: e.organizer?.emailAddress?.name,
    onlineMeetingUrl: e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl ?? undefined,
    source,
  };
}

async function calendarView(
  auth: AuthContext,
  path: string,
  startIso: string,
  endIso: string,
  source: CalendarEvent['source'],
): Promise<CalendarEvent[]> {
  const client = graphClientFor(auth.getGraphToken);
  const page = await client
    .api(path)
    // Return event times in UTC so the client can localize consistently.
    .header('Prefer', 'outlook.timezone="UTC"')
    .query({ startDateTime: startIso, endDateTime: endIso })
    .select(SELECT)
    .orderby('start/dateTime')
    .top(200)
    .get();
  return (page.value as GraphEvent[]).map((e) => toEvent(e, source));
}

/** Create an event on the signed-in user's Outlook calendar (syncs to Outlook).
 *  `start`/`end` are UTC ISO strings; we tell Graph they're in UTC. */
export async function createEvent(
  auth: AuthContext,
  input: {
    subject: string;
    start: string;
    end: string;
    isAllDay?: boolean;
    location?: string;
    body?: string;
  },
): Promise<CalendarEvent> {
  const client = graphClientFor(auth.getGraphToken);
  const created: GraphEvent = await client
    .api('/me/events')
    .header('Prefer', 'outlook.timezone="UTC"')
    .post({
      subject: input.subject,
      start: { dateTime: input.start, timeZone: 'UTC' },
      end: { dateTime: input.end, timeZone: 'UTC' },
      isAllDay: input.isAllDay ?? false,
      location: input.location ? { displayName: input.location } : undefined,
      body: input.body ? { contentType: 'text', content: input.body } : undefined,
    });
  return toEvent(created, 'personal');
}

/** Delete an event from the signed-in user's own Outlook calendar. */
export async function deleteEvent(auth: AuthContext, id: string): Promise<void> {
  const client = graphClientFor(auth.getGraphToken);
  await client.api(`/me/events/${id}`).delete();
}

function requireCompanyMailbox(): string {
  if (!config.calendar.companyMailbox) {
    throw new Error(
      'COMPANY_CALENDAR_MAILBOX is not set — configure a shared mailbox before posting company events.',
    );
  }
  return config.calendar.companyMailbox;
}

/**
 * Admin-posted company events, written straight to the real shared M365
 * calendar (not a separate app-only store) — so they show up natively in
 * Outlook for everyone with access, and getEvents() picks them up for free
 * via its existing /calendarView read of the same mailbox. Uses the signed-in
 * admin's own delegated token; they need Editor access to that calendar in
 * Exchange (Calendars.ReadWrite is already in GRAPH_SCOPES, no extra Entra
 * permission needed).
 */
export async function createCompanyEvent(
  auth: AuthContext,
  input: { subject: string; start: string; end: string; isAllDay?: boolean; location?: string },
): Promise<CalendarEvent> {
  const mailbox = requireCompanyMailbox();
  const client = graphClientFor(auth.getGraphToken);
  const created: GraphEvent = await client
    .api(`/users/${mailbox}/events`)
    .header('Prefer', 'outlook.timezone="UTC"')
    .post({
      subject: input.subject,
      start: { dateTime: input.start, timeZone: 'UTC' },
      end: { dateTime: input.end, timeZone: 'UTC' },
      isAllDay: input.isAllDay ?? false,
      location: input.location ? { displayName: input.location } : undefined,
    });
  return toEvent(created, 'company');
}

export async function deleteCompanyEvent(auth: AuthContext, id: string): Promise<void> {
  const mailbox = requireCompanyMailbox();
  const client = graphClientFor(auth.getGraphToken);
  await client.api(`/users/${mailbox}/events/${id}`).delete();
}

/** Unbounded list (not calendarView) for the admin management screen — plain
 *  event instances, no recurrence expansion. */
export async function listCompanyEvents(auth: AuthContext): Promise<CalendarEvent[]> {
  const mailbox = requireCompanyMailbox();
  const client = graphClientFor(auth.getGraphToken);
  const page = await client
    .api(`/users/${mailbox}/events`)
    .header('Prefer', 'outlook.timezone="UTC"')
    .select(SELECT)
    .orderby('start/dateTime')
    .top(200)
    .get();
  return (page.value as GraphEvent[]).map((e) => toEvent(e, 'company'));
}

/**
 * Events across the user's own mailbox and (if configured) a shared company
 * calendar, within [start, end]. Merged and sorted by start time.
 */
export async function getEvents(
  auth: AuthContext,
  startIso: string,
  endIso: string,
): Promise<Paged<CalendarEvent>> {
  const reads: Promise<CalendarEvent[]>[] = [
    calendarView(auth, '/me/calendarView', startIso, endIso, 'personal'),
  ];
  if (config.calendar.companyMailbox) {
    reads.push(
      calendarView(
        auth,
        `/users/${config.calendar.companyMailbox}/calendarView`,
        startIso,
        endIso,
        'company',
      ).catch(() => []), // a missing/forbidden company calendar shouldn't fail personal events
    );
  }
  const all = (await Promise.all(reads)).flat();
  all.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { items: all, nextCursor: null, total: all.length };
}
