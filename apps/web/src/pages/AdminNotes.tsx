import { useState } from 'react';
import { Lightbulb, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import type { AdminNote } from '@flowtech/shared';
import { useNotes, useNoteMutations } from '@/hooks/useIntranet';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';

/**
 * Admin-only notes / ideas board. The route + API are gated on `notes.view`,
 * which only administrators hold — nothing here is visible to regular staff.
 */
export default function AdminNotes() {
  const { data, isLoading, isError, refetch } = useNotes();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Admin Notes"
        subtitle="A private space for admins to share ideas and decisions."
        actions={
          <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New note
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-card border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-xs text-muted">
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-400" />
        Visible to administrators only. Use it for ideas, cost reviews, and internal decisions.
      </div>

      {showForm && <NoteForm onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No notes yet" hint="Share the first idea with the admin team." />
      ) : (
        <div className="space-y-3">
          {data.items.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note }: { note: AdminNote }) {
  const { update, remove } = useNoteMutations();
  return (
    <SectionCard>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-content">{note.title}</p>
            {note.pinned && <Badge tone="warning">Pinned</Badge>}
          </div>
          <p className="text-xs text-subtle">
            {note.authorName} · {relativeDate(note.updatedDateTime)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            className="ft-btn-ghost px-2 py-1"
            title={note.pinned ? 'Unpin' : 'Pin'}
            onClick={() => update.mutate({ id: note.id, pinned: !note.pinned })}
          >
            {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button className="ft-btn-ghost px-2 py-1" title="Delete" onClick={() => remove.mutate(note.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted">{note.body}</p>
    </SectionCard>
  );
}

function NoteForm({ onDone }: { onDone: () => void }) {
  const { create } = useNoteMutations();
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.title.trim().length < 1 || form.body.trim().length < 1) return setError('Title and note are required.');
    try {
      await create.mutateAsync(form);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SectionCard className="mb-4" title="New note">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <input className="ft-input" placeholder="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
      <textarea
        className="ft-input mt-3 min-h-[110px]"
        placeholder="Share an idea, decision, or reminder…"
        value={form.body}
        onChange={(e) => set({ body: e.target.value })}
      />
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
          Pin to top
        </label>
        <div className="flex gap-2">
          <button className="ft-btn-ghost" onClick={onDone}>Cancel</button>
          <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Post note'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
