import { useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import type { AttendanceRecord } from '@flowtech/shared';
import { useAdminAttendanceHistory, useAdminAttendanceToday } from '@/hooks/useAttendance';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { dateKey, startOfMonth } from '@/lib/date';
import { formatDuration, formatTime } from '@/lib/format';

/**
 * Admin attendance dashboard — view-only. Who's currently working, plus
 * everyone's EOD history for a chosen date range.
 */
export default function AdminAttendance() {
  const live = useAdminAttendanceToday();

  const monthStart = dateKey(startOfMonth(new Date()));
  const today = dateKey(new Date());
  const [fromInput, setFromInput] = useState(monthStart);
  const [toInput, setToInput] = useState(today);
  const [range, setRange] = useState({ from: monthStart, to: today });
  const history = useAdminAttendanceHistory(range.from, range.to);
  const items = history.data?.items ?? [];
  const [detail, setDetail] = useState<AttendanceRecord | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Attendance"
        subtitle="Team-wide punch status and end-of-day summaries."
        actions={live.data ? <Badge tone="success">{live.data.items.length} working now</Badge> : null}
      />

      <SectionCard className="mb-4" title="Currently working">
        {live.isLoading ? (
          <Skeleton className="h-14" />
        ) : live.isError ? (
          <ErrorState onRetry={() => live.refetch()} />
        ) : !live.data?.items.length ? (
          <EmptyState title="No one is currently punched in" />
        ) : (
          <ul className="divide-y divide-line/5">
            {live.data.items.map((e) => (
              <li key={e.userId} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-content">{e.userName}</span>
                <span className="text-muted">
                  Since {formatTime(e.checkIn)} · {formatDuration(e.elapsedMinutes * 60_000)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="All EOD history"
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
                  <th className="pb-2 font-semibold">Employee</th>
                  <th className="pb-2 font-semibold">Date</th>
                  <th className="pb-2 font-semibold">Check in</th>
                  <th className="pb-2 font-semibold">Check out</th>
                  <th className="pb-2 font-semibold">Duration</th>
                  <th className="pb-2 font-semibold">Tomorrow's plan</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-line/5 hover:bg-line/5"
                    onClick={() => setDetail(r)}
                  >
                    <td className="py-2.5 font-medium text-content">{r.userName}</td>
                    <td className="py-2.5 text-muted">{r.date}</td>
                    <td className="py-2.5 text-muted">{formatTime(r.checkIn)}</td>
                    <td className="py-2.5 text-muted">{r.checkOut ? formatTime(r.checkOut) : '—'}</td>
                    <td className="py-2.5 font-mono text-muted">
                      {r.checkOut ? formatDuration(new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) : '—'}
                    </td>
                    <td className="max-w-[16rem] truncate py-2.5 text-muted">{r.tomorrowsPlan || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {detail && <EodDetailDialog record={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function EodDetailDialog({ record, onClose }: { record: AttendanceRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-card border border-line/10 bg-elevated p-5 shadow-card">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-line/5"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-content">
          <ClipboardList className="h-4 w-4 text-accent-bright" /> {record.userName} — {record.date}
        </h3>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex gap-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Check in</dt>
              <dd className="mt-0.5 text-content">{formatTime(record.checkIn)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Check out</dt>
              <dd className="mt-0.5 text-content">{record.checkOut ? formatTime(record.checkOut) : 'Still working'}</dd>
            </div>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Completed tasks</dt>
            {record.completedTasks.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {record.completedTasks.map((t, i) => (
                  <li key={i} className="text-content">
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <dd className="mt-0.5 text-muted">—</dd>
            )}
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Tomorrow's plan</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-content">{record.tomorrowsPlan || '—'}</dd>
          </div>

          {record.blockers && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Blockers</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-content">{record.blockers}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
