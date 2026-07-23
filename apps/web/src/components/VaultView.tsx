import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Link as LinkIcon, Plus, ShieldAlert, Trash2, User } from 'lucide-react';
import type { VaultScope } from '@flowtech/shared';
import { useVault, useVaultMutations } from '@/hooks/useIntranet';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';

/**
 * Vault list + add for a given scope. Secrets are WRITE-ONLY — the value is
 * sent on create but never returned by the API, so the UI only ever shows that
 * a secret is set, never the secret itself.
 */
export function VaultView({ scope }: { scope: VaultScope }) {
  const { data, isLoading, isError, refetch } = useVault(scope);
  const { remove } = useVaultMutations(scope);
  const { can } = useCan();
  const [showForm, setShowForm] = useState(false);

  // Personal: anyone with vault.view can add their own. Open: needs vault.manage.
  const canAdd = scope === 'personal' ? can('vault.view') : can('vault.manage');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={scope === 'open' ? 'Open Vault' : 'Personal Vault'}
        subtitle={
          scope === 'open'
            ? 'Shared team credentials, visible to permitted members.'
            : 'Your private credentials — visible only to you.'
        }
        actions={
          canAdd && (
            <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> Add credential
            </button>
          )
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-card border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-content">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <span>
          Secrets are write-only and never displayed back. This mock keeps them in memory only — a production vault
          must encrypt secrets at rest in a secrets backend.
        </span>
      </div>

      {showForm && canAdd && <VaultForm scope={scope} onDone={() => setShowForm(false)} />}

      <SectionCard>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No credentials yet" />
        ) : (
          <ul className="divide-y divide-line/5">
            {data.items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent-bright">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{e.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    {e.username && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" /> {e.username}
                      </span>
                    )}
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-bright hover:underline">
                        <LinkIcon className="h-3 w-3" /> link
                      </a>
                    )}
                    <span className="text-subtle">Updated {relativeDate(e.updatedDateTime)}</span>
                  </div>
                </div>
                {e.category && <Badge>{e.category}</Badge>}
                {e.secretSet && <Badge tone="success">secret set</Badge>}
                {canAdd && (
                  <button
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                    onClick={() => confirm(`Delete "${e.title}"?`) && remove.mutate(e.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function VaultForm({ scope, onDone }: { scope: VaultScope; onDone: () => void }) {
  const { create } = useVaultMutations(scope);
  const [form, setForm] = useState({ title: '', username: '', url: '', notes: '', category: '', secret: '' });
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.title.trim().length < 1) return setError('Title is required.');
    try {
      await create.mutateAsync({
        title: form.title,
        username: form.username || undefined,
        url: form.url || undefined,
        notes: form.notes || undefined,
        category: form.category || undefined,
        scope,
        secret: form.secret || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SectionCard className="mb-4" title="Add credential">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="ft-input" placeholder="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        <input className="ft-input" placeholder="Username / email" value={form.username} onChange={(e) => set({ username: e.target.value })} />
        <input className="ft-input" placeholder="URL" value={form.url} onChange={(e) => set({ url: e.target.value })} />
        <input className="ft-input" placeholder="Category (optional)" value={form.category} onChange={(e) => set({ category: e.target.value })} />
        <div className="relative sm:col-span-2">
          <input
            className="ft-input pr-10"
            type={reveal ? 'text' : 'password'}
            placeholder="Secret (write-only — never shown again)"
            value={form.secret}
            onChange={(e) => set({ secret: e.target.value })}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-content"
            aria-label={reveal ? 'Hide secret' : 'Show secret'}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <textarea
          className="ft-input sm:col-span-2"
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="ft-btn-ghost" onClick={onDone}>Cancel</button>
        <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Save credential'}
        </button>
      </div>
    </SectionCard>
  );
}
