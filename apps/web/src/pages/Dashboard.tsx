import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Megaphone, Bell } from 'lucide-react';
import { useMe, useTodayEvents, useAnnouncements, useNotifications } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { greeting } from '@/lib/format';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  AnnouncementsWidget,
  CelebrationsWidget,
  QuickLinksWidget,
  TodayMeetingsWidget,
} from '@/features/dashboard/widgets';

const today = new Date().toLocaleDateString([], {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function Dashboard() {
  const { data: me } = useMe();
  const { can } = useCan();

  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mb-6 overflow-hidden rounded-card border border-line/10 bg-gradient-to-br from-accent/15 via-surface to-surface-deep p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent-bright">{today}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tightest">
              {greeting()}, {me?.givenName ?? me?.displayName ?? 'there'}
            </h1>
            <p className="mt-1 max-w-lg text-sm text-muted">
              Here's what's happening across FlowTech today.
            </p>
          </div>
          <WorldClocks />
        </div>
      </motion.div>

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {can('calendar.view') && <MeetingsStat />}
        {can('announcements.view') && <AnnouncementsStat />}
        {can('notifications.view') && <NotificationsStat />}
      </div>

      {/*
        Each widget is isolated in its own ErrorBoundary + query — a single
        failing data source can't take down the dashboard (reliability req).
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {can('calendar.view') && (
            <ErrorBoundary label="today-meetings">
              <TodayMeetingsWidget />
            </ErrorBoundary>
          )}
          {can('announcements.view') && (
            <ErrorBoundary label="announcements">
              <AnnouncementsWidget />
            </ErrorBoundary>
          )}
        </div>
        <div className="space-y-4">
          <ErrorBoundary label="quick-links">
            <QuickLinksWidget />
          </ErrorBoundary>
          <ErrorBoundary label="celebrations">
            <CelebrationsWidget />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// ---- World clocks (EST / IST) — analog + digital --------------------------
const ZONES: Array<{ label: string; tz: string }> = [
  { label: 'EST', tz: 'America/New_York' },
  { label: 'IST', tz: 'Asia/Kolkata' },
];

/** Hour/minute/second in the given time zone, for hand angles + readout. */
function zoneParts(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const h = get('hour') % 24;
  const m = get('minute');
  const s = get('second');
  const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  const day = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  return { h, m, s, time, day };
}

function AnalogClock({ h, m, s }: { h: number; m: number; s: number }) {
  const hourAngle = (h % 12) * 30 + m * 0.5;
  const minuteAngle = m * 6 + s * 0.1;
  const secondAngle = s * 6;
  const hand = (angle: number, len: number, className: string, width: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return (
      <line
        x1="50"
        y1="50"
        x2={50 + len * Math.cos(rad)}
        y2={50 + len * Math.sin(rad)}
        strokeWidth={width}
        strokeLinecap="round"
        className={className}
      />
    );
  };
  return (
    <svg viewBox="0 0 100 100" className="h-14 w-14">
      <circle cx="50" cy="50" r="46" className="fill-surface stroke-line/20" strokeWidth="3" />
      {/* Hour ticks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const rad = ((i * 30 - 90) * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={50 + 40 * Math.cos(rad)}
            y1={50 + 40 * Math.sin(rad)}
            x2={50 + 44 * Math.cos(rad)}
            y2={50 + 44 * Math.sin(rad)}
            strokeWidth={i % 3 === 0 ? 3 : 1.5}
            className="stroke-line/40"
          />
        );
      })}
      {hand(hourAngle, 24, 'stroke-content', 4)}
      {hand(minuteAngle, 34, 'stroke-content', 3)}
      {hand(secondAngle, 38, 'stroke-[color:rgb(var(--ft-accent))]', 1.5)}
      <circle cx="50" cy="50" r="3" className="fill-[color:rgb(var(--ft-accent))]" />
    </svg>
  );
}

function WorldClocks() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex gap-2">
      {ZONES.map(({ label, tz }) => {
        const { h, m, s, time, day } = zoneParts(now, tz);
        return (
          <div
            key={label}
            className="flex flex-col items-center rounded-card border border-line/10 bg-surface/70 px-3 py-2 backdrop-blur-sm"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-bright">{label}</p>
            <AnalogClock h={h} m={m} s={s} />
            <p className="mt-1 font-mono text-xs font-bold leading-none tabular-nums text-content">{time}</p>
            <p className="mt-0.5 text-[10px] text-muted">{day}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---- Stat tiles -----------------------------------------------------------
function StatTile({
  icon,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line/10 bg-surface p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent-bright">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-content">{value}</p>
        <p className="mt-1 truncate text-xs text-muted">{hint ?? label}</p>
      </div>
    </div>
  );
}

function MeetingsStat() {
  const { data } = useTodayEvents();
  const n = data?.items.length ?? 0;
  return <StatTile icon={<CalendarClock className="h-5 w-5" />} value={n} label="meetings" hint={`Meeting${n === 1 ? '' : 's'} today`} />;
}

function AnnouncementsStat() {
  const { data } = useAnnouncements();
  const n = data?.items.length ?? 0;
  return <StatTile icon={<Megaphone className="h-5 w-5" />} value={n} label="announcements" hint="Company announcements" />;
}

function NotificationsStat() {
  const { data } = useNotifications();
  const n = data?.unread ?? 0;
  return <StatTile icon={<Bell className="h-5 w-5" />} value={n} label="unread" hint="Unread notifications" />;
}
