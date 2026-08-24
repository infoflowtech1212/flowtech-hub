import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, LogIn } from 'lucide-react';
import { useMe } from '@/hooks/useApi';
import { useAttendanceCalendar, useAttendanceHistory, useAttendanceToday, useAttendancePunch } from '@/hooks/useAttendance';
import { EodFormDialog } from '@/components/EodFormDialog';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { ApiRequestError } from '@/lib/api';
import { formatDuration, formatTime, greeting } from '@/lib/format';
import {
  addMonths,
  dateKey,
  endOfMonth,
  isSameMonth,
  isToday,
  monthGridSunday,
  monthTitle,
  startOfMonth,
  WEEKDAY_LABELS_SUN,
} from '@/lib/date';
import type { AttendanceDayStatus } from '@flowtech/shared';

const STATUS_STYLE: Record<AttendanceDayStatus, string> = {
  present: 'bg-success/15 text-success',
  absent: 'bg-danger/15 text-danger',
  weekend: 'bg-line/10 text-subtle',
  holiday: 'bg-warning/15 text-warning',
};

const LEGEND: { status: AttendanceDayStatus; label: string }[] = [
  { status: 'present', label: 'Present' },
  { status: 'absent', label: 'Absent' },
  { status: 'weekend', label: 'Weekend' },
  { status: 'holiday', label: 'Holiday' },
];

export default function Attendance() {
  const { data: me } = useMe();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Attendance" subtitle="Track your daily punch-in, punch-out and end-of-day summaries." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PunchCard name={me?.givenName ?? me?.displayName ?? 'there'} />
        <AttendanceCalendar />
      </div>
      <div className="mt-4">
        <EodHistory />
      </div>
    </div>
  );
}

// --- Punch card ----------------------------------------------------------
function PunchCard({ name }: { name: string }) {
  const today = useAttendanceToday();
  const { punchIn } = useAttendancePunch();
  const [showEod, setShowEod] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const state = today.data?.state;
  useEffect(() => {
    if (state !== 'working') return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [state]);

  const record = today.data?.record ?? null;
  const duration = !record
    ? null
    : state === 'working'
      ? formatDuration(now.getTime() - new Date(record.checkIn).getTime())
      : record.checkOut
        ? formatDuration(new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime())
        : null;

  return (
    <SectionCard className="flex flex-col">
      {today.isLoading ? (
        <Skeleton className="h-40" />
      ) : today.isError ? (
        <ErrorState onRetry={() => today.refetch()} />
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{greeting()}</p>
          <div className="mt-1 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tightest">{name}</h2>
            <span
              className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                state === 'working'
                  ? 'bg-success/15 text-success'
                  : state === 'done'
                    ? 'bg-line/10 text-muted'
                    : 'bg-line/5 text-subtle'
              }`}
            >
              {state === 'working' ? 'Working' : state === 'done' ? 'Done for today' : 'Not checked in'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Check in</p>
              <p className="mt-1 font-mono text-sm font-bold text-content">
                {record ? formatTime(record.checkIn) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Check out</p>
              <p className="mt-1 font-mono text-sm font-bold text-content">
                {record?.checkOut ? formatTime(record.checkOut) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Duration</p>
              <p className="mt-1 font-mono text-sm font-bold text-content">{duration ?? '—'}</p>
            </div>
          </div>

          <div className="mt-5">
            {state === 'not-checked-in' && (
              <button
                className="ft-btn-primary w-full"
                onClick={() => punchIn.mutate()}
                disabled={punchIn.isPending}
              >
                <LogIn className="h-4 w-4" /> {punchIn.isPending ? 'Punching in…' : 'Punch in'}
              </button>
            )}
            {state === 'working' && (
              <>
                <button className="ft-btn w-full bg-danger text-white hover:bg-danger/90" onClick={() => setShowEod(true)}>
                  <Clock className="h-4 w-4" /> Punch out
                </button>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  Working overnight? You can punch out until 6:00 AM the next morning.
                </p>
              </>
            )}
            {state === 'done' && <p className="text-center text-sm text-muted">See you tomorrow.</p>}
            {punchIn.isError && (
              <p className="mt-2 text-center text-xs text-danger">
                {punchIn.error instanceof ApiRequestError ? punchIn.error.message : 'Could not punch in.'}
              </p>
            )}
          </div>
        </>
      )}
      {showEod && <EodFormDialog onClose={() => setShowEod(false)} />}
    </SectionCard>
  );
}

// --- Month calendar --------------------------------------------------------
function AttendanceCalendar() {
  const [anchor, setAnchor] = useState(() => new Date());
  const from = dateKey(startOfMonth(anchor));
  const to = dateKey(endOfMonth(anchor));
  const cal = useAttendanceCalendar(from, to);

  const statusByDate = useMemo(() => {
    const map = new Map<string, AttendanceDayStatus>();
    for (const d of cal.data?.items ?? []) map.set(d.date, d.status);
    return map;
  }, [cal.data]);

  const grid = monthGridSunday(anchor);

  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content">{monthTitle(anchor)}</h2>
        <div className="flex items-center gap-1">
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-line/5"
            onClick={() => setAnchor((a) => addMonths(a, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-line/5"
            onClick={() => setAnchor((a) => addMonths(a, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-subtle">
        {WEEKDAY_LABELS_SUN.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {cal.isLoading ? (
        <Skeleton className="mt-1 h-56" />
      ) : cal.isError ? (
        <ErrorState onRetry={() => cal.refetch()} />
      ) : (
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((day, i) => {
            const inMonth = isSameMonth(day, anchor);
            const status = statusByDate.get(dateKey(day));
            return (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${
                  inMonth ? (status ? STATUS_STYLE[status] : 'text-content') : 'text-subtle/40'
                } ${isToday(day) ? 'ring-2 ring-accent' : ''}`}
              >
                {day.getDate()}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line/10 pt-3 text-xs text-muted">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[l.status]}`} />
            {l.label}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

// --- EOD history -----------------------------------------------------------
function EodHistory() {
  const monthStart = dateKey(startOfMonth(new Date()));
  const today = dateKey(new Date());
  const [fromInput, setFromInput] = useState(monthStart);
  const [toInput, setToInput] = useState(today);
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const history = useAttendanceHistory(range.from, range.to);
  const items = history.data?.items ?? [];

  return (
    <SectionCard
      title="EOD Summaries"
      action={
        <div className="flex items-center gap-2">
          <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="ft-input w-auto" />
          <span className="text-xs text-muted">to</span>
          <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className="ft-input w-auto" />
          <button className="ft-btn-ghost" onClick={() => setRange({ from: fromInput, to: toInput })}>
            Apply
          </button>
        </div>
      }
    >
      {history.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : history.isError ? (
        <ErrorState onRetry={() => history.refetch()} />
      ) : !items.length ? (
        <EmptyState title="No attendance records in this range" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Check in</th>
                <th className="pb-2 font-semibold">Check out</th>
                <th className="pb-2 font-semibold">Duration</th>
                <th className="pb-2 font-semibold">Completed tasks</th>
                <th className="pb-2 font-semibold">Blockers</th>
                <th className="pb-2 font-semibold">Tomorrow's plan</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const expanded = expandedId === r.id;
                const duration = r.checkOut
                  ? formatDuration(new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime())
                  : '—';
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t border-line/5 hover:bg-line/5">
                      <td className="py-2.5 font-medium text-content">{r.date}</td>
                      <td className="py-2.5 text-muted">{formatTime(r.checkIn)}</td>
                      <td className="py-2.5 text-muted">{r.checkOut ? formatTime(r.checkOut) : '—'}</td>
                      <td className="py-2.5 font-mono text-muted">{duration}</td>
                      <td className="max-w-[16rem] truncate py-2.5 text-muted">
                        {r.completedTasks.join(', ') || '—'}
                      </td>
                      <td className="max-w-[10rem] truncate py-2.5 text-muted">{r.blockers || '—'}</td>
                      <td className="max-w-[14rem] truncate py-2.5 text-muted">{r.tomorrowsPlan || '—'}</td>
                      <td className="py-2.5 text-right">
                        <button
                          className="inline-flex rounded-lg p-1.5 text-muted hover:bg-line/10 hover:text-accent-bright"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          aria-label={expanded ? 'Collapse' : 'Expand'}
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-line/5 bg-surface-deep/50">
                        <td colSpan={8} className="px-2 py-4">
                          <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
                            <div>
                              <p className="mb-1 font-semibold uppercase tracking-wide text-subtle">
                                Completed tasks
                              </p>
                              {r.completedTasks.length ? (
                                <ul className="space-y-1">
                                  {r.completedTasks.map((t, i) => (
                                    <li key={i} className="text-content">✓ {t}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-muted">—</p>
                              )}
                            </div>
                            <div>
                              <p className="mb-1 font-semibold uppercase tracking-wide text-subtle">Blockers</p>
                              <p className="text-content">{r.blockers || '—'}</p>
                            </div>
                            <div>
                              <p className="mb-1 font-semibold uppercase tracking-wide text-subtle">
                                Tomorrow's plan
                              </p>
                              <p className="text-content">{r.tomorrowsPlan || '—'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
