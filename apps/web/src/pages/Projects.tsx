import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Project, ProjectStatus } from '@flowtech/shared';
import { useProjects, useProjectMutations } from '@/hooks/useIntranet';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';

const statusTone: Record<ProjectStatus, 'neutral' | 'accent' | 'success' | 'warning'> = {
  planning: 'neutral',
  active: 'accent',
  'on-hold': 'warning',
  completed: 'success',
};

export default function Projects() {
  const { data, isLoading, isError, refetch } = useProjects();
  const { can } = useCan();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Projects"
        subtitle="Workstreams, scope, timelines, and owners."
        actions={
          can('projects.manage') && (
            <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> New project
            </button>
          )
        }
      />

      {showForm && can('projects.manage') && <ProjectForm onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No projects yet" hint="Create your first workstream." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.items.map((p) => (
            <SectionCard key={p.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-content">{p.name}</p>
                  <p className="text-xs text-muted">Owner: {p.owner}</p>
                </div>
                <Badge tone={statusTone[p.status]}>{p.status}</Badge>
              </div>
              {p.description && <p className="mb-3 line-clamp-2 text-sm text-muted">{p.description}</p>}
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Progress</span>
                <span>{p.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${p.progress}%` }} />
              </div>
              {(p.dueDate || p.tags?.length) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
                  {p.dueDate && <span>Due {formatDate(p.dueDate)}</span>}
                  {p.tags?.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectForm({ onDone }: { onDone: () => void }) {
  const { create } = useProjectMutations();
  const [form, setForm] = useState<Omit<Project, 'id' | 'createdDateTime'>>({
    name: '',
    description: '',
    status: 'planning',
    owner: '',
    progress: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Project>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.name.trim().length < 2 || !form.owner.trim()) return setError('Name and owner are required.');
    try {
      await create.mutateAsync(form);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SectionCard className="mb-4" title="New project">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="ft-input" placeholder="Project name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        <input className="ft-input" placeholder="Owner" value={form.owner} onChange={(e) => set({ owner: e.target.value })} />
        <select className="ft-input" value={form.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })}>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on-hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          Progress
          <input
            type="range"
            min={0}
            max={100}
            value={form.progress}
            onChange={(e) => set({ progress: Number(e.target.value) })}
            className="flex-1 accent-[color:rgb(var(--ft-accent))]"
          />
          <span className="w-10 text-right text-content">{form.progress}%</span>
        </label>
      </div>
      <textarea
        className="ft-input mt-3 min-h-[70px]"
        placeholder="Description (optional)"
        value={form.description ?? ''}
        onChange={(e) => set({ description: e.target.value })}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button className="ft-btn-ghost" onClick={onDone}>Cancel</button>
        <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Create project'}
        </button>
      </div>
    </SectionCard>
  );
}
