import { useState } from 'react';
import { Check, Copy, Link2, Plus } from 'lucide-react';
import type { TicketPriority, TicketStatus } from '@flowtech/shared';
import { useTickets, useTicketMutations } from '@/hooks/useIntranet';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';

const priorityTone: Record<TicketPriority, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'danger',
};
const statusTone: Record<TicketStatus, 'accent' | 'warning' | 'success' | 'neutral'> = {
  open: 'warning',
  'in-progress': 'accent',
  resolved: 'success',
  closed: 'neutral',
};

export default function HelpDesk() {
  const { data, isLoading, isError, refetch } = useTickets();
  const { can } = useCan();
  const { update } = useTicketMutations();
  const isAgent = can('helpdesk.manage');
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Help Desk"
        subtitle={isAgent ? 'Triage and resolve internal support tickets.' : 'Submit and track your support tickets.'}
        actions={
          <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> Submit a ticket
          </button>
        }
      />

      {showForm && <TicketForm onDone={() => setShowForm(false)} />}

      {isAgent && <ShareableForm />}

      <SectionCard title={isAgent ? 'All tickets' : 'My tickets'}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState title="No tickets" hint="Submit a ticket to get help." />
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
                {isAgent ? (
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
                ) : (
                  <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ShareableForm() {
  const url = `${window.location.origin}/submit`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-accent/20 bg-accent/5 px-4 py-3">
      <Link2 className="h-4 w-4 shrink-0 text-accent-bright" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">Public request form</p>
        <p className="truncate text-xs text-muted">
          Share this link — anyone can submit; it creates a ticket here + emails info@.
        </p>
      </div>
      <code className="hidden max-w-[220px] truncate rounded bg-surface-deep px-2 py-1 text-xs text-muted sm:block">
        {url}
      </code>
      <div className="flex gap-1">
        <a href="/submit" target="_blank" rel="noreferrer" className="ft-btn-ghost">
          Open
        </a>
        <button
          className="ft-btn-ghost"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

function TicketForm({ onDone }: { onDone: () => void }) {
  const { create } = useTicketMutations();
  const [form, setForm] = useState({ subject: '', description: '', category: 'Access', priority: 'medium' as TicketPriority });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.subject.trim().length < 2) return setError('Subject is required.');
    try {
      await create.mutateAsync({ ...form, description: form.description || undefined });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  return (
    <SectionCard className="mb-4" title="Submit a ticket">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="space-y-3">
        <input className="ft-input" placeholder="Subject" value={form.subject} onChange={(e) => set({ subject: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <select className="ft-input" value={form.category} onChange={(e) => set({ category: e.target.value })}>
            <option>Access</option>
            <option>Hardware</option>
            <option>Software</option>
            <option>Request</option>
            <option>Other</option>
          </select>
          <select className="ft-input" value={form.priority} onChange={(e) => set({ priority: e.target.value as TicketPriority })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <textarea
          className="ft-input min-h-[80px]"
          placeholder="Describe the issue…"
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          <button className="ft-btn-ghost" onClick={onDone}>Cancel</button>
          <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? 'Submitting…' : 'Submit ticket'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
