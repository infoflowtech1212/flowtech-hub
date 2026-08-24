import { Check, X } from 'lucide-react';
import { usePendingApprovals, useDecideRequest, useAllRequests } from '@/hooks/useApi';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';

/**
 * Admin approvals — the review queue for leave / expense / document requests,
 * moved off the employee dashboard. Approvers act here; the full request
 * history sits below for context.
 */
export default function AdminApprovals() {
  const pending = usePendingApprovals();
  const decide = useDecideRequest();
  const all = useAllRequests();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Approvals"
        subtitle="Review and decide on leave, expense, and document requests."
        actions={pending.data ? <Badge tone="warning">{pending.data.items.length} pending</Badge> : null}
      />

      <SectionCard className="mb-4" title="Awaiting decision">
        {pending.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : pending.isError ? (
          <ErrorState onRetry={() => pending.refetch()} />
        ) : !pending.data?.items.length ? (
          <EmptyState title="All caught up" hint="No requests are waiting for a decision." />
        ) : (
          <ul className="divide-y divide-line/5">
            {pending.data.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{r.title}</p>
                  <p className="truncate text-xs text-muted">
                    {r.requesterName} · <span className="capitalize">{r.type}</span>
                    {r.amount != null && ` · $${r.amount.toFixed(2)}`}
                    {r.startDate && ` · ${relativeDate(r.startDate)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="ft-btn-ghost text-success"
                    onClick={() => decide.mutate({ id: r.id, decision: 'approved' })}
                    disabled={decide.isPending}
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    className="ft-btn-ghost text-danger"
                    onClick={() => decide.mutate({ id: r.id, decision: 'rejected' })}
                    disabled={decide.isPending}
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="All requests">
        {all.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : all.isError ? (
          <ErrorState onRetry={() => all.refetch()} />
        ) : !all.data?.items.length ? (
          <EmptyState title="No requests yet" />
        ) : (
          <ul className="divide-y divide-line/5">
            {all.data.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{r.title}</p>
                  <p className="truncate text-xs text-muted">
                    {r.requesterName} · <span className="capitalize">{r.type}</span> · {relativeDate(r.createdDateTime)}
                    {r.approverName && ` · approver: ${r.approverName}`}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
