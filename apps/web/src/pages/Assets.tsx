import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Asset } from '@flowtech/shared';
import { useAssetMutations, useAssets } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';

const statusTone = { active: 'success', 'in-service': 'warning', retired: 'neutral' } as const;
const empty: Omit<Asset, 'id'> = { tag: '', name: '', location: '', status: 'active', assignedTo: '' };

export default function Assets() {
  const { data, isLoading, isError, refetch } = useAssets();
  const { can } = useCan();
  const manage = can('assets.manage');
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Asset tracker"
        subtitle="Lightweight inventory — powered by QR Trax."
        actions={
          manage && (
            <button className="ft-btn-primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add asset
            </button>
          )
        }
      />

      {editing && manage && (
        <AssetForm asset={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
      )}

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
          <EmptyState title="No assets tracked yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="pb-2 font-semibold">Tag</th>
                  <th className="pb-2 font-semibold">Asset</th>
                  <th className="pb-2 font-semibold">Location</th>
                  <th className="pb-2 font-semibold">Assigned</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Serviced</th>
                  {manage && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-t border-line/5 hover:bg-line/5">
                    <td className="py-2.5 font-mono text-xs text-accent-bright">{a.tag}</td>
                    <td className="py-2.5 text-content">{a.name}</td>
                    <td className="py-2.5 text-muted">{a.location ?? '—'}</td>
                    <td className="py-2.5 text-muted">{a.assignedTo ?? '—'}</td>
                    <td className="py-2.5">
                      <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                    </td>
                    <td className="py-2.5 text-muted">
                      {a.lastServicedDate ? formatDate(a.lastServicedDate) : '—'}
                    </td>
                    {manage && (
                      <td className="py-2.5 text-right">
                        <button
                          className="rounded-lg p-1.5 text-muted hover:bg-line/10 hover:text-accent-bright"
                          onClick={() => setEditing(a)}
                          aria-label={`Edit ${a.name}`}
                        >
                          <Pencil className="h-4 w-4" />
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

function AssetForm({ asset, onDone }: { asset?: Asset; onDone: () => void }) {
  const { create, update, remove } = useAssetMutations();
  const [form, setForm] = useState<Omit<Asset, 'id'>>(asset ? { ...asset } : { ...empty });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Asset>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (!form.tag.trim() || !form.name.trim()) return setError('Tag and name are required.');
    try {
      if (asset) await update.mutateAsync({ id: asset.id, ...form });
      else await create.mutateAsync(form);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <SectionCard className="mb-4" title={asset ? 'Edit asset' : 'New asset'}>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tag">
          <input className="ft-input" value={form.tag} onChange={(e) => set({ tag: e.target.value })} placeholder="FT-LT-0001" />
        </Field>
        <Field label="Name">
          <input className="ft-input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="MacBook Pro 14&quot;" />
        </Field>
        <Field label="Location">
          <input className="ft-input" value={form.location ?? ''} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Assigned to">
          <input className="ft-input" value={form.assignedTo ?? ''} onChange={(e) => set({ assignedTo: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="ft-input" value={form.status} onChange={(e) => set({ status: e.target.value as Asset['status'] })}>
            <option value="active">Active</option>
            <option value="in-service">In service</option>
            <option value="retired">Retired</option>
          </select>
        </Field>
        <Field label="Last serviced">
          <input
            type="date"
            className="ft-input"
            value={form.lastServicedDate?.slice(0, 10) ?? ''}
            onChange={(e) => set({ lastServicedDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between">
        {asset ? (
          <button
            className="ft-btn-ghost text-danger"
            onClick={async () => {
              if (confirm(`Delete asset "${asset.name}"?`)) {
                await remove.mutateAsync(asset.id);
                onDone();
              }
            }}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button className="ft-btn-ghost" onClick={onDone} disabled={busy}>
            Cancel
          </button>
          <button className="ft-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
