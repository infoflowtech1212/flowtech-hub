import { useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { Capability, CapabilityInfo, Role } from '@flowtech/shared';
import { useCapabilityCatalog, useRoleMutations, useRoles } from '@/hooks/useAdmin';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';

export default function AdminRoles() {
  const roles = useRoles();
  const catalog = useCapabilityCatalog();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (roles.isLoading || catalog.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (roles.isError) return <ErrorState onRetry={() => roles.refetch()} />;

  const roleList = roles.data?.items ?? [];
  const selected = roleList.find((r) => r.id === selectedId) ?? null;
  const caps = catalog.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Roles"
        subtitle="Each role is a bundle of capabilities. Assign roles to people under People & Access."
        actions={
          <button className="ft-btn-primary" onClick={() => { setCreating(true); setSelectedId(null); }}>
            <Plus className="h-4 w-4" /> New role
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <SectionCard title="All roles">
          <ul className="space-y-1">
            {roleList.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => { setSelectedId(r.id); setCreating(false); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === r.id ? 'bg-accent/12 text-accent-bright' : 'hover:bg-line/5'
                  }`}
                >
                  <span className="font-medium">{r.name}</span>
                  {r.system && <Badge>system</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        {creating ? (
          <RoleEditor key="new" catalog={caps} onDone={() => setCreating(false)} />
        ) : selected ? (
          <RoleEditor key={selected.id} role={selected} catalog={caps} onDone={() => setSelectedId(null)} />
        ) : (
          <SectionCard>
            <EmptyState title="Select a role" hint="Choose a role to edit its capabilities, or create a new one." />
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  catalog,
  onDone,
}: {
  role?: Role;
  catalog: CapabilityInfo[];
  onDone: () => void;
}) {
  const { create, update, remove } = useRoleMutations();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<Capability>>(new Set(role?.capabilities ?? []));
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, CapabilityInfo[]>();
    for (const c of catalog) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return [...map.entries()];
  }, [catalog]);

  const toggle = (cap: Capability) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cap) ? next.delete(cap) : next.add(cap);
      return next;
    });

  async function save() {
    setError(null);
    const capabilities = [...selected];
    try {
      if (role) {
        await update.mutateAsync({ id: role.id, name, description, capabilities });
      } else {
        if (name.trim().length < 2) return setError('Name must be at least 2 characters.');
        await create.mutateAsync({ name, description, capabilities });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Role name
          </label>
          <input
            className="ft-input max-w-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={role?.system}
            placeholder="e.g. Delivery Lead"
          />
          {role?.system && (
            <p className="mt-1 text-[11px] text-subtle">System role — name is fixed, capabilities editable.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {role && !role.system && (
            <button
              className="ft-btn-ghost text-danger"
              onClick={async () => {
                if (confirm(`Delete role "${role.name}"?`)) {
                  await remove.mutateAsync(role.id);
                  onDone();
                }
              }}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button className="ft-btn-primary" onClick={save} disabled={busy}>
            <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        Description
      </label>
      <input
        className="ft-input mb-5"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What this role is for"
      />

      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Capabilities</p>
      <div className="space-y-4">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{group}</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {items.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-line/10 bg-surface-deep p-2.5 hover:border-accent/30"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[color:rgb(var(--ft-accent))]"
                    checked={selected.has(c.key)}
                    onChange={() => toggle(c.key)}
                  />
                  <span>
                    <span className="block text-sm text-content">{c.label}</span>
                    <span className="block text-[11px] text-subtle">{c.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
