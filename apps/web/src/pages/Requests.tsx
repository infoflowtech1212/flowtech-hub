import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Plus, X } from 'lucide-react';
import {
  useCreateRequest,
  usePendingApprovals,
  useRequests,
  useDecideRequest,
} from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';

export default function Requests() {
  const { can } = useCan();
  const [showForm, setShowForm] = useState(false);
  const mine = useRequests();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Requests & approvals"
        subtitle="Leave, expense, and document approvals — routed via Power Automate."
        actions={
          can('requests.create') && (
            <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> New request
            </button>
          )
        }
      />

      {showForm && can('requests.create') && (
        <NewRequestForm onDone={() => setShowForm(false)} />
      )}

      {/* Approvals queue — only for approvers */}
      {can('requests.approve') && <ApprovalsQueue />}

      <SectionCard title="My requests">
        {mine.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : mine.isError ? (
          <ErrorState onRetry={() => mine.refetch()} />
        ) : !mine.data?.items.length ? (
          <EmptyState title="No requests yet" hint="Submit your first request to get started." />
        ) : (
          <ul className="divide-y divide-line/5">
            {mine.data.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{r.title}</p>
                  <p className="truncate text-xs text-muted">
                    <span className="capitalize">{r.type}</span> · {relativeDate(r.createdDateTime)}
                    {r.amount != null && ` · $${r.amount.toFixed(2)}`}
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

function ApprovalsQueue() {
  const pending = usePendingApprovals();
  const decide = useDecideRequest();

  return (
    <SectionCard
      className="mb-4"
      title="Awaiting your approval"
      action={pending.data ? <Badge tone="warning">{pending.data.items.length}</Badge> : null}
    >
      {pending.isLoading ? (
        <Skeleton className="h-14" />
      ) : pending.isError ? (
        <ErrorState onRetry={() => pending.refetch()} />
      ) : !pending.data?.items.length ? (
        <EmptyState title="Nothing awaiting you" />
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
  );
}

const schema = z
  .object({
    type: z.enum(['leave', 'expense', 'document']),
    title: z.string().min(2, 'Title is required'),
    description: z.string().optional(),
    amount: z.coerce.number().positive().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine((v) => v.type !== 'expense' || (v.amount ?? 0) > 0, {
    message: 'Amount is required for expenses',
    path: ['amount'],
  })
  .refine((v) => v.type !== 'leave' || (v.startDate && v.endDate), {
    message: 'Start and end dates are required for leave',
    path: ['startDate'],
  });

type FormValues = z.infer<typeof schema>;

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const create = useCreateRequest();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: 'leave' } });
  const type = watch('type');
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await create.mutateAsync({
        type: values.type,
        title: values.title,
        description: values.description || undefined,
        amount: values.type === 'expense' ? values.amount : undefined,
        startDate: values.type === 'leave' ? values.startDate : undefined,
        endDate: values.type === 'leave' ? values.endDate : undefined,
      });
      onDone();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Submission failed');
    }
  };

  return (
    <SectionCard className="mb-4" title="New request">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {serverError && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{serverError}</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Type</span>
            <select className="ft-input" {...register('type')}>
              <option value="leave">Leave</option>
              <option value="expense">Expense</option>
              <option value="document">Document approval</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Title</span>
            <input className="ft-input" placeholder="Short summary" {...register('title')} />
            {errors.title && <span className="text-[11px] text-danger">{errors.title.message}</span>}
          </label>
        </div>

        {type === 'expense' && (
          <label className="block max-w-[200px]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Amount ($)</span>
            <input type="number" step="0.01" className="ft-input" {...register('amount')} />
            {errors.amount && <span className="text-[11px] text-danger">{errors.amount.message}</span>}
          </label>
        )}

        {type === 'leave' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Start</span>
              <input type="date" className="ft-input" {...register('startDate')} />
              {errors.startDate && <span className="text-[11px] text-danger">{errors.startDate.message}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">End</span>
              <input type="date" className="ft-input" {...register('endDate')} />
            </label>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Details</span>
          <textarea className="ft-input min-h-[80px]" placeholder="Optional details" {...register('description')} />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="ft-btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="ft-btn-primary" disabled={isSubmitting || create.isPending}>
            {isSubmitting || create.isPending ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
