import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Award,
  Building2,
  CalendarClock,
  Cake,
  CheckSquare,
  Megaphone,
  PartyPopper,
  Rocket,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Celebration } from '@flowtech/shared';
import { AppLinkIcon } from '@/components/AppLinkIcon';
import {
  useAnnouncements,
  useCelebrations,
  usePendingApprovals,
  useQuickLinks,
  useTodayEvents,
} from '@/hooks/useApi';
import { SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatTime, relativeDate } from '@/lib/format';

function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ---- Today's meetings -----------------------------------------------------
export function TodayMeetingsWidget() {
  const { data, isLoading, isError, refetch } = useTodayEvents();
  return (
    <SectionCard
      title="Today's meetings"
      action={
        <Link to="/calendar" className="text-xs text-accent-bright hover:underline">
          Calendar
        </Link>
      }
    >
      {isLoading ? (
        <WidgetSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No meetings today" />
      ) : (
        <ul className="space-y-1">
          {data.items.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/5"
            >
              <div className="w-14 shrink-0 text-xs font-medium text-muted">
                {formatTime(e.start)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{e.subject}</p>
                <p className="truncate text-xs text-muted">{e.location ?? '—'}</p>
              </div>
              {e.onlineMeetingUrl && (
                <a
                  href={e.onlineMeetingUrl}
                  className="text-accent-bright hover:text-accent"
                  aria-label="Join online meeting"
                >
                  <Video className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---- Pending approvals ----------------------------------------------------
export function PendingApprovalsWidget() {
  const { data, isLoading, isError, refetch } = usePendingApprovals();
  return (
    <SectionCard
      title="Pending approvals"
      action={
        <Link to="/requests" className="text-xs text-accent-bright hover:underline">
          All requests
        </Link>
      }
    >
      {isLoading ? (
        <WidgetSkeleton rows={2} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={<CheckSquare className="h-5 w-5" />} title="Nothing awaiting you" />
      ) : (
        <ul className="space-y-1">
          {data.items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  {r.requesterName} · {relativeDate(r.createdDateTime)}
                </p>
              </div>
              <Badge tone="accent">{r.type}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---- Latest announcements (image cards) -----------------------------------
// Category-tinted banner + icon shown when an announcement has no image.
const announcementStyle: Record<string, { grad: string; Icon: LucideIcon }> = {
  Company: { grad: 'from-sky-500/40 to-indigo-500/20', Icon: Building2 },
  Product: { grad: 'from-violet-500/40 to-fuchsia-500/20', Icon: Rocket },
  Operations: { grad: 'from-amber-500/40 to-orange-500/20', Icon: Wrench },
};
const defaultStyle = { grad: 'from-accent/40 to-accent/10', Icon: Megaphone };

export function AnnouncementsWidget() {
  const { data, isLoading, isError, refetch } = useAnnouncements();
  return (
    <SectionCard
      title="Latest announcements"
      action={
        <Link to="/news" className="text-xs text-accent-bright hover:underline">
          News
        </Link>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No announcements yet" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.items.slice(0, 4).map((a) => {
            const style = (a.category && announcementStyle[a.category]) || defaultStyle;
            const Icon = style.Icon;
            return (
              <Link
                key={a.id}
                to="/news"
                className="group flex flex-col overflow-hidden rounded-card border border-line/10 bg-surface transition-colors hover:border-accent/40"
              >
                {/* Banner */}
                <div className={`relative h-24 shrink-0 bg-gradient-to-br ${style.grad}`}>
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="absolute bottom-2 right-2 h-9 w-9 text-white/70" />
                  )}
                  <div className="absolute left-2 top-2 flex items-center gap-1.5">
                    {a.pinned && <Badge tone="accent">Pinned</Badge>}
                    {a.category && (
                      <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                        {a.category}
                      </span>
                    )}
                  </div>
                </div>
                {/* Body */}
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-content">{a.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{a.body}</p>
                  <p className="mt-2 text-[11px] text-subtle">
                    {a.author} · {relativeDate(a.publishedDateTime)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Upcoming celebrations ------------------------------------------------
function whenLabel(daysUntil: number) {
  if (daysUntil <= 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `in ${daysUntil} days`;
}

function CelebrationRow({ c, kind }: { c: Celebration; kind: 'birthday' | 'work-anniversary' }) {
  const Icon = kind === 'birthday' ? Cake : Award;
  const tone = kind === 'birthday' ? 'text-pink-500' : 'text-amber-500';
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line/10 ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-content">
          {c.personName}
          {c.years ? <span className="ml-1 text-xs font-normal text-muted">· {c.years} yr{c.years === 1 ? '' : 's'}</span> : null}
        </p>
        <p className="truncate text-xs text-muted">{c.jobTitle ?? c.department ?? '—'}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-content">{whenLabel(c.daysUntil)}</p>
        <p className="text-[11px] text-subtle">{formatDate(c.date)}</p>
      </div>
    </li>
  );
}

export function CelebrationsWidget() {
  const { data, isLoading, isError, refetch } = useCelebrations();
  const birthdays = data?.birthdays ?? [];
  const anniversaries = data?.workAnniversaries ?? [];
  const empty = !birthdays.length && !anniversaries.length;

  return (
    <SectionCard title="Upcoming celebrations">
      {isLoading ? (
        <WidgetSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : empty ? (
        <EmptyState icon={<PartyPopper className="h-5 w-5" />} title="Nothing coming up" />
      ) : (
        <div className="space-y-4">
          {!!birthdays.length && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <Cake className="h-3.5 w-3.5" /> Birthdays
              </p>
              <ul className="space-y-1">
                {birthdays.map((c) => (
                  <CelebrationRow key={c.id} c={c} kind="birthday" />
                ))}
              </ul>
            </div>
          )}
          {!!anniversaries.length && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <Award className="h-3.5 w-3.5" /> Work anniversaries
              </p>
              <ul className="space-y-1">
                {anniversaries.map((c) => (
                  <CelebrationRow key={c.id} c={c} kind="work-anniversary" />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Quick links ----------------------------------------------------------
export function QuickLinksWidget() {
  const { data, isLoading } = useQuickLinks();
  // Prefer "Company Sites" for the dashboard; fall back to the first few links.
  const all = data?.items ?? [];
  const featured = all.filter((l) => l.category === 'Company Sites');
  const links = (featured.length ? featured : all).slice(0, 6);

  return (
    <SectionCard
      title="Quick links"
      action={
        <Link to="/app-links" className="text-xs text-accent-bright hover:underline">
          All apps
        </Link>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {links.map((l) => {
            return (
              <a
                key={l.id}
                href={l.url || '#'}
                target={l.url && l.url !== '#' ? '_blank' : undefined}
                rel="noreferrer"
                className="group flex flex-col gap-2 rounded-card border border-line/10 bg-surface-deep p-3 transition-colors hover:border-accent/50"
              >
                <div className="flex items-center justify-between">
                  <AppLinkIcon label={l.label} url={l.url} logo={l.logo} />
                  <ArrowUpRight className="h-3.5 w-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <span className="text-sm font-medium text-content">{l.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
