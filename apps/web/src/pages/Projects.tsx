import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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

type ProjectFormValue = Omit<Project, 'id' | 'createdDateTime'>;

const emptyForm: ProjectFormValue = { name: '', description: '', status: 'planning', owner: '', progress: 0 };

export default function Projects() {
  const { data, isLoading, isError, refetch } = useProjects();
  const { can } = useCan();
  const canManage = can('projects.manage');
  const { create, update, remove } = useProjectMutations();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Projects"
        subtitle="Workstreams, scope, timelines, and owners."
        actions={
          canManage && (
            <button
              className="ft-btn-primary"
              onClick={() => {
                setEditingId(null);
                setShowForm((s) => !s);
              }}
            >
              <Plus className="h-4 w-4" /> New project
            </button>
          )
        }
      />

      {showForm && canManage && (
        <ProjectFormCard
          title="New project"
          initial={emptyForm}
          submitLabel="Create project"
          isPending={create.isPending}
          onCancel={() => setShowForm(false)}
          onSubmit={async (form) => {
            await create.mutateAsync(form);
            setShowForm(false);
          }}
        />
      )}

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
          {data.items.map((p) =>
            editingId === p.id ? (
              <ProjectFormCard
                key={p.id}
                title="Edit project"
                initial={{
                  name: p.name,
                  description: p.description ?? '',
                  status: p.status,
                  owner: p.owner,
                  progress: p.progress,
                  startDate: p.startDate,
                  dueDate: p.dueDate,
                  tags: p.tags,
                }}
                submitLabel="Save changes"
                isPending={update.isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={async (form) => {
                  await update.mutateAsync({ id: p.id, ...form });
                  setEditingId(null);
                }}
              />
            ) : (
              <SectionCard key={p.id}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-content">{p.name}</p>
                    <p className="text-xs text-muted">Owner: {p.owner}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                    {canManage && (
                      <>
                        <button
                          className="rounded-lg p-1.5 text-muted hover:bg-line/10 hover:text-content"
                          onClick={() => {
                            setShowForm(false);
                            setEditingId(p.id);
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                          onClick={() => {
                            if (confirm(`Delete "${p.name}"?`)) remove.mutate(p.id);
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
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
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ProjectFormCard({
  title,
  initial,
  submitLabel,
  isPending,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: ProjectFormValue;
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (form: ProjectFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<ProjectFormValue>(initial);
  const [tagsInput, setTagsInput] = useState((initial.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProjectFormValue>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.name.trim().length < 2 || !form.owner.trim()) return setError('Name and owner are required.');
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onSubmit({ ...form, tags: tags.length ? tags : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SectionCard className="mb-4" title={title}>
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Start date</span>
          <input
            type="date"
            className="ft-input"
            value={form.startDate ? form.startDate.slice(0, 10) : ''}
            onChange={(e) => set({ startDate: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Due date</span>
          <input
            type="date"
            className="ft-input"
            value={form.dueDate ? form.dueDate.slice(0, 10) : ''}
            onChange={(e) => set({ dueDate: e.target.value || undefined })}
          />
        </label>
        <input
          className="ft-input sm:col-span-2"
          placeholder="Tags (comma-separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
      </div>
      <textarea
        className="ft-input mt-3 min-h-[70px]"
        placeholder="Description (optional)"
        value={form.description ?? ''}
        onChange={(e) => set({ description: e.target.value })}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button className="ft-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="ft-btn-primary" onClick={save} disabled={isPending}>
          {isPending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </SectionCard>
  );
}
