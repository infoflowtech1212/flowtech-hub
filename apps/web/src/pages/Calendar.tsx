import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, PartyPopper, Plus, Trash2, Video } from 'lucide-react';
import { clsx } from 'clsx';
import type { CalendarEvent, Holiday } from '@flowtech/shared';
import { useCalendar, useCreateEvent, useDeleteEvent, useHolidays } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { formatTime } from '@/lib/format';
import {
  addDays,
  addMonths,
  endOfDay,
  isSameMonth,
  isToday,
  monthGrid,
  monthTitle,
  startOfDay,
  weekDays,
  weekTitle,
  WEEKDAY_LABELS,
} from '@/lib/date';

type View = 'month' | 'week';

export default function Calendar() {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  // Query range covers the visible grid (month grid spans ~6 weeks).
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (view === 'month') {
      const grid = monthGrid(anchor);
      return [startOfDay(grid[0]).toISOString(), endOfDay(grid[grid.length - 1]).toISOString()];
    }
    const days = weekDays(anchor);
    return [startOfDay(days[0]).toISOString(), endOfDay(days[6]).toISOString()];
  }, [view, anchor]);

  const { data, isLoading, isError, refetch } = useCalendar(rangeStart, rangeEnd);

  const { data: holidays } = useHolidays();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of data?.items ?? []) {
      const key = new Date(e.start).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [data]);

  const holidaysByDay = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidays?.items ?? []) {
      const key = new Date(`${h.date}T00:00:00`).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    }
    return map;
  }, [holidays]);

  const { can } = useCan();
  const [showNew, setShowNew] = useState(false);

  const go = (dir: -1 | 0 | 1) => {
    if (dir === 0) return setAnchor(new Date());
    setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, dir * 7)));
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Company calendar"
        subtitle="Your Outlook events and the shared company calendar."
        actions={
          <div className="flex items-center gap-2">
            {can('calendar.view') && (
              <button className="ft-btn-primary" onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4" /> New event
              </button>
            )}
            <div className="flex items-center gap-1 rounded-pill border border-line/10 bg-surface-deep p-0.5">
              {(['month', 'week'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={clsx(
                    'rounded-pill px-3 py-1 text-sm font-medium capitalize transition-colors',
                    view === v ? 'bg-accent text-white' : 'text-muted hover:text-content',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {showNew && <NewEventModal defaultDate={anchor} onClose={() => setShowNew(false)} />}

      {/* Calendar (left) + company holidays (right) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{view === 'month' ? monthTitle(anchor) : weekTitle(anchor)}</h2>
            <div className="flex items-center gap-1">
              <button className="ft-btn-ghost px-2" onClick={() => go(-1)} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="ft-btn-ghost" onClick={() => go(0)}>
                Today
              </button>
              <button className="ft-btn-ghost px-2" onClick={() => go(1)} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isError ? (
            <div className="ft-card p-6">
              <ErrorState onRetry={() => refetch()} />
            </div>
          ) : view === 'month' ? (
            <MonthView
              anchor={anchor}
              eventsByDay={eventsByDay}
              holidaysByDay={holidaysByDay}
              loading={isLoading}
              onSelect={setSelected}
            />
          ) : (
            <WeekView
              anchor={anchor}
              eventsByDay={eventsByDay}
              holidaysByDay={holidaysByDay}
              loading={isLoading}
              onSelect={setSelected}
            />
          )}

          <p className="mt-3 text-center text-xs text-subtle">
            New events are written to your Outlook calendar. RSVP arrives in a later pass.
          </p>
        </div>

        {/* Right: company holidays */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <HolidaysPanel holidays={holidays?.items ?? []} />
        </aside>
      </div>

      {selected && <EventDetail event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** Small amber holiday chip shown in calendar day cells. */
function HolidayChip({ holiday }: { holiday: Holiday }) {
  return (
    <div
      className="flex w-full items-center gap-1 truncate rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning"
      title={`Company holiday: ${holiday.name}`}
    >
      <PartyPopper className="h-3 w-3 shrink-0" />
      <span className="truncate">{holiday.name}</span>
    </div>
  );
}

/** Read-only "Company holidays" list. Holidays are managed from the admin panel. */
function HolidaysPanel({ holidays }: { holidays: Holiday[] }) {
  const upcoming = holidays.filter((h) => new Date(`${h.date}T23:59:59`) >= new Date());

  return (
    <SectionCard title="Company holidays">
      {!holidays.length ? (
        <EmptyState icon={<PartyPopper className="h-5 w-5" />} title="No company holidays yet" />
      ) : (
        <ul className="divide-y divide-line/5">
          {(upcoming.length ? upcoming : holidays).map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-warning/15 text-warning">
                <PartyPopper className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{h.name}</p>
                <p className="text-xs text-muted">
                  {new Date(`${h.date}T00:00:00`).toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <Badge tone="warning">Holiday</Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function NewEventModal({ defaultDate, onClose }: { defaultDate: Date; onClose: () => void }) {
  const create = useCreateEvent();
  const iso = defaultDate.toISOString().slice(0, 10);
  const [form, setForm] = useState({
    subject: '',
    date: iso,
    start: '09:00',
    end: '10:00',
    allDay: false,
    location: '',
    body: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.subject.trim().length < 1) return setError('Title is required.');

    // Graph wants timezone-naive dateTimes (it's told they're UTC).
    let start: string;
    let end: string;
    if (form.allDay) {
      // All-day events must run midnight → next-day midnight.
      const next = new Date(`${form.date}T00:00:00`);
      next.setDate(next.getDate() + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      start = `${form.date}T00:00:00`;
      end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T00:00:00`;
    } else {
      const s = new Date(`${form.date}T${form.start}`);
      const e = new Date(`${form.date}T${form.end}`);
      if (e.getTime() <= s.getTime()) return setError('End must be after start.');
      // Local pick → UTC instant → drop the trailing Z (Graph gets timeZone: UTC).
      start = s.toISOString().slice(0, -1);
      end = e.toISOString().slice(0, -1);
    }

    try {
      await create.mutateAsync({
        subject: form.subject,
        start,
        end,
        isAllDay: form.allDay,
        location: form.location || undefined,
        body: form.body || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the event.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <SectionCard className="relative w-full max-w-md" title="New event">
        {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="space-y-3">
          <input
            className="ft-input"
            placeholder="Event title"
            autoFocus
            value={form.subject}
            onChange={(e) => set({ subject: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Date</span>
              <input type="date" className="ft-input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-content">
              <input type="checkbox" className="accent-[color:rgb(var(--ft-accent))]" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
              All day
            </label>
          </div>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Start</span>
                <input type="time" className="ft-input" value={form.start} onChange={(e) => set({ start: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">End</span>
                <input type="time" className="ft-input" value={form.end} onChange={(e) => set({ end: e.target.value })} />
              </label>
            </div>
          )}
          <input className="ft-input" placeholder="Location (optional)" value={form.location} onChange={(e) => set({ location: e.target.value })} />
          <textarea className="ft-input min-h-[70px]" placeholder="Notes (optional)" value={form.body} onChange={(e) => set({ body: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="ft-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

function EventChip({ event, onSelect }: { event: CalendarEvent; onSelect: (e: CalendarEvent) => void }) {
  return (
    <button
      onClick={() => onSelect(event)}
      className={clsx(
        'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors',
        event.source === 'company'
          ? 'bg-accent/15 text-accent-bright hover:bg-accent/25'
          : 'bg-line/10 text-content hover:bg-line/20',
      )}
      title={`${formatTime(event.start)} ${event.subject}`}
    >
      {!event.isAllDay && <span className="text-subtle">{formatTime(event.start)} </span>}
      {event.subject}
    </button>
  );
}

function MonthView({
  anchor,
  eventsByDay,
  holidaysByDay,
  loading,
  onSelect,
}: {
  anchor: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  holidaysByDay: Map<string, Holiday[]>;
  loading: boolean;
  onSelect: (e: CalendarEvent) => void;
}) {
  const grid = monthGrid(anchor);
  return (
    <div className="ft-card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-line/10 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((day) => {
          const key = day.toDateString();
          const events = eventsByDay.get(key) ?? [];
          const dayHolidays = holidaysByDay.get(key) ?? [];
          const dim = !isSameMonth(day, anchor);
          return (
            <div
              key={day.toISOString()}
              className={clsx(
                'min-h-[92px] border-b border-r border-line/5 p-1.5',
                dayHolidays.length ? 'bg-warning/5' : dim && 'bg-surface-deep/40',
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    isToday(day)
                      ? 'bg-accent font-bold text-white'
                      : dim
                        ? 'text-subtle'
                        : 'text-muted',
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
              {loading ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <div className="space-y-1">
                  {dayHolidays.map((h) => (
                    <HolidayChip key={h.id} holiday={h} />
                  ))}
                  {events.slice(0, 3).map((e) => (
                    <EventChip key={e.id} event={e} onSelect={onSelect} />
                  ))}
                  {events.length > 3 && (
                    <p className="px-1 text-[10px] text-subtle">+{events.length - 3} more</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  eventsByDay,
  holidaysByDay,
  loading,
  onSelect,
}: {
  anchor: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  holidaysByDay: Map<string, Holiday[]>;
  loading: boolean;
  onSelect: (e: CalendarEvent) => void;
}) {
  const days = weekDays(anchor);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const key = day.toDateString();
        const events = eventsByDay.get(key) ?? [];
        const dayHolidays = holidaysByDay.get(key) ?? [];
        return (
          <div key={day.toISOString()} className={clsx('ft-card p-3', dayHolidays.length && 'ring-1 ring-warning/30')}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {day.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday(day) ? 'bg-accent font-bold text-white' : 'text-muted',
                )}
              >
                {day.getDate()}
              </span>
            </div>
            {loading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="space-y-1">
                {dayHolidays.map((h) => (
                  <HolidayChip key={h.id} holiday={h} />
                ))}
                {events.map((e) => (
                  <EventChip key={e.id} event={e} onSelect={onSelect} />
                ))}
                {!events.length && !dayHolidays.length && (
                  <p className="py-2 text-center text-[11px] text-subtle">—</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const start = new Date(event.start);
  const del = useDeleteEvent();
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside className="relative h-full w-full max-w-sm animate-fade-up border-l border-line/10 bg-elevated p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-line/5"
          aria-label="Close"
        >
          ✕
        </button>
        <Badge tone={event.source === 'company' ? 'accent' : 'neutral'}>{event.source}</Badge>
        <h2 className="mt-3 text-lg font-bold">{event.subject}</h2>
        <p className="mt-1 text-sm text-muted">
          {start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          {!event.isAllDay && ` · ${formatTime(event.start)} – ${formatTime(event.end)}`}
          {event.isAllDay && ' · All day'}
        </p>

        <dl className="mt-6 space-y-3 text-sm">
          {event.location && (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted" />
              <span>{event.location}</span>
            </div>
          )}
          {event.organizer && (
            <div className="flex items-center gap-3">
              <span className="text-muted">Organizer</span>
              <span>{event.organizer}</span>
            </div>
          )}
        </dl>

        {event.onlineMeetingUrl && (
          <a href={event.onlineMeetingUrl} target="_blank" rel="noreferrer" className="ft-btn-primary mt-6 w-full">
            <Video className="h-4 w-4" /> Join online meeting
          </a>
        )}

        {event.source === 'personal' && (
          <button
            className="ft-btn-ghost mt-3 w-full text-danger"
            disabled={del.isPending}
            onClick={() => del.mutate(event.id, { onSuccess: onClose })}
          >
            <Trash2 className="h-4 w-4" /> {del.isPending ? 'Deleting…' : 'Delete event'}
          </button>
        )}
      </aside>
    </div>
  );
}
