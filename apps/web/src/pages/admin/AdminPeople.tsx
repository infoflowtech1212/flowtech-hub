import { useState } from 'react';
import { Search, Shield } from 'lucide-react';
import type { Role, RoleAssignment } from '@flowtech/shared';
import { useAssignRoles, usePeopleAccess, useRoles } from '@/hooks/useAdmin';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';

export default function AdminPeople() {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const people = usePeopleAccess(debounced);
  const roles = useRoles();
  const [editing, setEditing] = useState<RoleAssignment | null>(null);

  const roleById = new Map((roles.data?.items ?? []).map((r) => [r.id, r]));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="People & Access"
        subtitle="Assign roles to employees. Access takes effect immediately."
      />

      <div className="mb-4 flex items-center gap-2 rounded-pill border border-line/10 bg-surface-deep px-4 py-2.5">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="w-full bg-transparent text-sm text-content placeholder:text-subtle focus:outline-none"
        />
      </div>

      <SectionCard>
        {people.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : people.isError ? (
          <ErrorState onRetry={() => people.refetch()} />
        ) : !people.data?.items.length ? (
          <EmptyState title="No people found" />
        ) : (
          <ul className="divide-y divide-line/5">
            {people.data.items.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 py-3">
                <Avatar name={p.displayName} src={undefined} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{p.displayName}</p>
                  <p className="truncate text-xs text-muted">{p.jobTitle ?? p.mail}</p>
                </div>
                <div className="hidden flex-wrap items-center justify-end gap-1 sm:flex">
                  {p.bootstrapAdmin && <Badge tone="accent">Entra admin</Badge>}
                  {p.roleIds.length ? (
                    p.roleIds.map((id) => (
                      <Badge key={id}>{roleById.get(id)?.name ?? id}</Badge>
                    ))
                  ) : (
                    <Badge>Employee (default)</Badge>
                  )}
                </div>
                <button className="ft-btn-ghost shrink-0" onClick={() => setEditing(p)}>
                  <Shield className="h-4 w-4" /> Manage
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {editing && (
        <AssignDrawer
          person={editing}
          roles={roles.data?.items ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AssignDrawer({
  person,
  roles,
  onClose,
}: {
  person: RoleAssignment;
  roles: Role[];
  onClose: () => void;
}) {
  const assign = useAssignRoles();
  const [selected, setSelected] = useState<Set<string>>(new Set(person.roleIds));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function save() {
    await assign.mutateAsync({ userId: person.userId, roleIds: [...selected] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside className="relative h-full w-full max-w-sm animate-fade-up overflow-y-auto border-l border-line/10 bg-elevated p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-line/5"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="flex items-center gap-3">
          <Avatar name={person.displayName} size={44} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{person.displayName}</h2>
            <p className="truncate text-xs text-muted">{person.jobTitle ?? person.mail}</p>
          </div>
        </div>

        {person.bootstrapAdmin && (
          <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-bright">
            This person is a full admin via the Entra admin group. That access can't be removed here.
          </p>
        )}

        <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
          Assigned roles
        </p>
        <div className="space-y-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line/10 bg-surface-deep p-3 hover:border-accent/30"
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-[color:rgb(var(--ft-accent))]"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
              />
              <span>
                <span className="block text-sm font-medium text-content">{r.name}</span>
                <span className="block text-[11px] text-subtle">
                  {r.description} · {r.capabilities.length} capabilities
                </span>
              </span>
            </label>
          ))}
        </div>

        <button className="ft-btn-primary mt-6 w-full" onClick={save} disabled={assign.isPending}>
          {assign.isPending ? 'Saving…' : 'Save assignments'}
        </button>
      </aside>
    </div>
  );
}
