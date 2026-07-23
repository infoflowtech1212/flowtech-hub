import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { LegalDocument, LegalStatus, LegalType } from '@flowtech/shared';
import { useLegal, useLegalMutations } from '@/hooks/useIntranet';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';

const statusTone: Record<LegalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  draft: 'neutral',
  'in-review': 'accent',
  signed: 'success',
  expired: 'danger',
};

export default function Legal() {
  const { data, isLoading, isError, refetch } = useLegal();
  const { remove } = useLegalMutations();
  const { can } = useCan();
  const manage = can('legal.manage');
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Legal"
        subtitle="Contracts, agreements, NDAs, and policies."
        actions={
          manage && (
            <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> New document
            </button>
          )
        }
      />

      {showForm && manage && <LegalForm onDone={() => setShowForm(false)} />}

      <SectionCard>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState title="No legal documents yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="pb-2 font-semibold">Title</th>
                  <th className="pb-2 font-semibold">Type</th>
                  <th className="pb-2 font-semibold">Counterparty</th>
                  <th className="pb-2 font-semibold">Owner</th>
                  <th className="pb-2 font-semibold">Expires</th>
                  <th className="pb-2 font-semibold">Status</th>
                  {manage && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id} className="border-t border-line/5 hover:bg-line/5">
                    <td className="py-2.5 text-content">{d.title}</td>
                    <td className="py-2.5 capitalize text-muted">{d.type}</td>
                    <td className="py-2.5 text-muted">{d.counterparty ?? '—'}</td>
                    <td className="py-2.5 text-muted">{d.owner}</td>
                    <td className="py-2.5 text-muted">{d.expiryDate ? formatDate(d.expiryDate) : '—'}</td>
                    <td className="py-2.5">
                      <Badge tone={statusTone[d.status]}>{d.status}</Badge>
                    </td>
                    {manage && (
                      <td className="py-2.5 text-right">
                        <button
                          className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                          onClick={() => confirm(`Delete "${d.title}"?`) && remove.mutate(d.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function LegalForm({ onDone }: { onDone: () => void }) {
  const { create } = useLegalMutations();
  const [form, setForm] = useState<Omit<LegalDocument, 'id' | 'createdDateTime'>>({
    title: '',
    type: 'contract',
    status: 'draft',
    owner: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<LegalDocument>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.title.trim().length < 2 || !form.owner.trim()) return setError('Title and owner are required.');
    try {
      await create.mutateAsync(form);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SectionCard className="mb-4" title="New legal document">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="ft-input" placeholder="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        <input className="ft-input" placeholder="Owner" value={form.owner} onChange={(e) => set({ owner: e.target.value })} />
        <select className="ft-input" value={form.type} onChange={(e) => set({ type: e.target.value as LegalType })}>
          <option value="contract">Contract</option>
          <option value="nda">NDA</option>
          <option value="policy">Policy</option>
          <option value="agreement">Agreement</option>
          <option value="other">Other</option>
        </select>
        <select className="ft-input" value={form.status} onChange={(e) => set({ status: e.target.value as LegalStatus })}>
          <option value="draft">Draft</option>
          <option value="in-review">In review</option>
          <option value="signed">Signed</option>
          <option value="expired">Expired</option>
        </select>
        <input className="ft-input" placeholder="Counterparty (optional)" value={form.counterparty ?? ''} onChange={(e) => set({ counterparty: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-muted">
          Expires
          <input
            type="date"
            className="ft-input"
            value={form.expiryDate?.slice(0, 10) ?? ''}
            onChange={(e) => set({ expiryDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="ft-btn-ghost" onClick={onDone}>Cancel</button>
        <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Create'}
        </button>
      </div>
    </SectionCard>
  );
}
