import { useState } from 'react';
import { CalendarDays, PartyPopper, Plus, Trash2 } from 'lucide-react';
import { useCompanyEvents, useCompanyEventMutations, useHolidays, useHolidayMutations } from '@/hooks/useApi';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { formatDate, formatTime } from '@/lib/format';

export default function AdminEvents() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Events & Holidays" subtitle="Post company events and manage holidays shown on everyone's calendar." />
      <CompanyEventsSection />
      <HolidaysSection />
    </div>
  );
}

// ---- Company events -------------------------------------------------------
function CompanyEventsSection() {
  const { data, isLoading, isError, refetch } = useCompanyEvents();
  const { create, remove } = useCompanyEventMutations();
  const [form, setForm] = useState({ subject: '', date: '', allDay: true, start: '09:00', end: '10:00', location: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function add() {
    setError(null);
    if (form.subject.trim().length < 1 || !form.date) return setError('Title and date are required.');
    try {
      const startIso = new Date(`${form.date}T${form.allDay ? '00:00' : form.start}:00`).toISOString();
      const endIso = form.allDay
        ? new Date(new Date(`${form.date}T00:00:00`).getTime() + 864e5).toISOString()
        : new Date(`${form.date}T${form.end}:00`).toISOString();
      await create.mutateAsync({ subject: form.subject, start: startIso, end: endIso, isAllDay: form.allDay, location: form.location || undefined });
      setForm({ subject: '', date: '', allDay: true, start: '09:00', end: '10:00', location: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add event.');
    }
  }

  return (
    <SectionCard title="Company events">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className="ft-input" placeholder="Event title" value={form.subject} onChange={(e) => set({ subject: e.target.value })} />
        <input className="ft-input" placeholder="Location (optional)" value={form.location} onChange={(e) => set({ location: e.target.value })} />
        <input type="date" className="ft-input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> All-day
        </label>
        {!form.allDay && (
          <>
            <input type="time" className="ft-input" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            <input type="time" className="ft-input" value={form.end} onChange={(e) => set({ end: e.target.value })} />
          </>
        )}
      </div>
      <div className="mb-4 flex justify-end">
        <button className="ft-btn-primary" onClick={add} disabled={create.isPending}>
          <Plus className="h-4 w-4" /> {create.isPending ? 'Adding…' : 'Add event'}
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No company events yet" />
      ) : (
        <ul className="divide-y divide-line/5">
          {data.items.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <CalendarDays className="h-4 w-4 shrink-0 text-accent-bright" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{e.subject}</p>
                <p className="truncate text-xs text-muted">
                  {formatDate(e.start)}
                  {!e.isAllDay && ` · ${formatTime(e.start)}–${formatTime(e.end)}`}
                  {e.location && ` · ${e.location}`}
                </p>
              </div>
              <button className="ft-btn-ghost px-2 py-1" onClick={() => remove.mutate(e.id)} aria-label="Delete event">
                <Trash2 className="h-4 w-4 text-danger" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---- Holidays -------------------------------------------------------------
function HolidaysSection() {
  const { data, isLoading, isError, refetch } = useHolidays();
  const { create, remove } = useHolidayMutations();
  const [form, setForm] = useState({ name: '', date: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function add() {
    setError(null);
    if (form.name.trim().length < 1 || !form.date) return setError('Name and date are required.');
    try {
      await create.mutateAsync({ name: form.name, date: form.date, description: form.description || undefined });
      setForm({ name: '', date: '', description: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add holiday.');
    }
  }

  return (
    <SectionCard title="Company holidays">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className="ft-input" placeholder="Holiday name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        <input type="date" className="ft-input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <button className="ft-btn-primary" onClick={add} disabled={create.isPending}>
          <Plus className="h-4 w-4" /> {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={<PartyPopper className="h-5 w-5" />} title="No holidays set" />
      ) : (
        <ul className="divide-y divide-line/5">
          {data.items.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2.5">
              <PartyPopper className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{h.name}</p>
                <p className="truncate text-xs text-muted">{formatDate(h.date)}{h.description && ` · ${h.description}`}</p>
              </div>
              <button className="ft-btn-ghost px-2 py-1" onClick={() => remove.mutate(h.id)} aria-label="Delete holiday">
                <Trash2 className="h-4 w-4 text-danger" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
