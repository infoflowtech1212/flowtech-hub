import { useState } from 'react';
import { clsx } from 'clsx';
import {
  Briefcase,
  Building2,
  Cake,
  CalendarDays,
  Clock,
  Linkedin,
  List,
  Mail,
  MapPin,
  Network,
  Phone,
  Search,
  UserRound,
} from 'lucide-react';
import type { DirectoryPerson } from '@flowtech/shared';
import { useDirectory, usePersonChart } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/Page';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useDebounced } from '@/hooks/useDebounced';
import { formatDate } from '@/lib/format';
import { OrgChart } from '@/components/OrgChart';

type View = 'people' | 'chart';

export default function Directory() {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);
  const [view, setView] = useState<View>('people');
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDirectory(debounced);

  const people = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Organisation"
        subtitle="Active people across FlowTech — pulled from Entra ID."
        actions={
          <div className="flex items-center gap-1 rounded-pill border border-line/10 bg-surface-deep p-0.5">
            <ViewTab active={view === 'people'} onClick={() => setView('people')} icon={<List className="h-4 w-4" />}>
              People
            </ViewTab>
            <ViewTab active={view === 'chart'} onClick={() => setView('chart')} icon={<Network className="h-4 w-4" />}>
              Org chart
            </ViewTab>
          </div>
        }
      />

      {view === 'chart' ? (
        <OrgChart />
      ) : (
        <>
          <div className="mb-5 flex items-center gap-2 rounded-pill border border-line/10 bg-surface-deep px-4 py-2.5">
            <Search className="h-4 w-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, title, or department…"
              aria-label="Search directory"
              className="w-full bg-transparent text-sm text-content placeholder:text-subtle focus:outline-none"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !people.length ? (
            <EmptyState title="No people found" hint="Try a different name or department." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {people.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="ft-card flex items-center gap-3 p-4 text-left transition-colors hover:border-accent/40"
                  >
                    <Avatar name={p.displayName} src={`/api/directory/${p.id}/photo`} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-content">{p.displayName}</p>
                      {p.jobTitle ? (
                        <p className="truncate text-xs text-muted">{p.jobTitle}</p>
                      ) : (
                        <p className="truncate text-xs text-subtle italic">No role set</p>
                      )}
                      {p.department && <p className="truncate text-xs text-subtle">{p.department}</p>}
                    </div>
                  </button>
                ))}
              </div>

              {hasNextPage && (
                <div className="mt-5 flex justify-center">
                  <button
                    className="ft-btn-ghost"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {selected && <PersonDrawer person={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-accent text-white' : 'text-muted hover:text-content',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
        <div className="text-sm text-content">{children}</div>
      </div>
    </div>
  );
}

function PersonDrawer({ person, onClose }: { person: DirectoryPerson; onClose: () => void }) {
  const { data: chart, isLoading } = usePersonChart(person.id);
  // The detail endpoint returns the enriched person; fall back to the list item.
  const p = chart?.person ?? person;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside className="relative h-full w-full max-w-md animate-fade-up overflow-y-auto border-l border-line/10 bg-elevated p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-line/5"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header card */}
        <div className="flex flex-col items-center rounded-card bg-gradient-to-br from-accent/12 to-transparent p-5 text-center">
          <Avatar name={p.displayName} src={`/api/directory/${p.id}/photo`} size={88} />
          <h2 className="mt-3 text-xl font-bold">{p.displayName}</h2>
          {p.jobTitle && <p className="text-sm text-muted">{p.jobTitle}</p>}
          {p.department && <p className="text-xs text-subtle">{p.department}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {p.mail && (
              <a href={`mailto:${p.mail}`} className="ft-btn-ghost px-3 py-1 text-xs">
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            )}
            {p.linkedIn && (
              <a href={p.linkedIn} target="_blank" rel="noreferrer" className="ft-btn-ghost px-3 py-1 text-xs">
                <Linkedin className="h-3.5 w-3.5" /> LinkedIn
              </a>
            )}
          </div>
        </div>

        {p.bio && <p className="mt-4 rounded-card bg-surface-deep p-3 text-sm text-muted">{p.bio}</p>}

        {/* Details */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {p.mail && (
            <DetailRow icon={<Mail className="h-4 w-4" />} label="Email">
              <a href={`mailto:${p.mail}`} className="break-all text-accent-bright hover:underline">{p.mail}</a>
            </DetailRow>
          )}
          {p.mobilePhone && (
            <DetailRow icon={<Phone className="h-4 w-4" />} label="Mobile">
              <a href={`tel:${p.mobilePhone}`} className="hover:underline">{p.mobilePhone}</a>
            </DetailRow>
          )}
          {p.jobTitle && (
            <DetailRow icon={<Briefcase className="h-4 w-4" />} label="Position">{p.jobTitle}</DetailRow>
          )}
          {p.department && (
            <DetailRow icon={<Building2 className="h-4 w-4" />} label="Department">{p.department}</DetailRow>
          )}
          {p.officeLocation && (
            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location">{p.officeLocation}</DetailRow>
          )}
          {p.managerName && (
            <DetailRow icon={<UserRound className="h-4 w-4" />} label="Reporting manager">{p.managerName}</DetailRow>
          )}
          {p.birthday && (
            <DetailRow icon={<Cake className="h-4 w-4" />} label="Date of birth">{formatDate(p.birthday)}</DetailRow>
          )}
          {p.hireDate && (
            <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Joining date">{formatDate(p.hireDate)}</DetailRow>
          )}
          {p.workingHours && (
            <DetailRow icon={<Clock className="h-4 w-4" />} label="Working hours">{p.workingHours}</DetailRow>
          )}
        </div>

        {/* Org chart */}
        <div className="mt-8">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Org chart</h3>
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="space-y-3">
              {chart?.manager && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-subtle">Manager</p>
                  <OrgRow person={chart.manager} />
                </div>
              )}
              {chart?.reports && chart.reports.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-subtle">
                    Direct reports ({chart.reports.length})
                  </p>
                  <div className="space-y-1">
                    {chart.reports.map((r) => (
                      <OrgRow key={r.id} person={r} />
                    ))}
                  </div>
                </div>
              )}
              {!chart?.manager && !chart?.reports?.length && (
                <p className="text-xs text-subtle">No reporting relationships found.</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function OrgRow({ person }: { person: DirectoryPerson }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
      <Avatar name={person.displayName} src={`/api/directory/${person.id}/photo`} size={28} />
      <div className="min-w-0">
        <p className="truncate text-sm text-content">{person.displayName}</p>
        <p className="truncate text-xs text-subtle">{person.jobTitle}</p>
      </div>
    </div>
  );
}
