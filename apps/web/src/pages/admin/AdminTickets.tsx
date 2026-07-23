import type { TicketPriority, TicketStatus } from '@flowtech/shared';
import { useTickets, useTicketMutations } from '@/hooks/useIntranet';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { relativeDate } from '@/lib/format';

const priorityTone: Record<TicketPriority, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'danger',
};

/** Admin triage of all help-desk tickets. */
export default function AdminTickets() {
  const { data, isLoading, isError, refetch } = useTickets();
  const { update } = useTicketMutations();
  const open = (data?.items ?? []).filter((t) => t.status === 'open' || t.status === 'in-progress').length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Help Desk Tickets"
        subtitle="Triage and resolve every ticket across FlowTech."
        actions={data ? <Badge tone={open ? 'warning' : 'success'}>{open} open</Badge> : null}
      />
      <SectionCard title="All tickets">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState title="No tickets" />
        ) : (
          <ul className="divide-y divide-line/5">
            {data.items.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{t.subject}</p>
                  <p className="truncate text-xs text-muted">
                    {t.requesterName} · {t.category} · {relativeDate(t.createdDateTime)}
                    {t.assignee && ` · assigned: ${t.assignee}`}
                  </p>
                </div>
                <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                <select
                  className="ft-input max-w-[130px] py-1 text-xs"
                  value={t.status}
                  onChange={(e) => update.mutate({ id: t.id, status: e.target.value as TicketStatus })}
                >
                  <option value="open">Open</option>
                  <option value="in-progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
