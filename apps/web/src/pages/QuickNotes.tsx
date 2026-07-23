import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { QuickNote, QuickNoteColor } from '@flowtech/shared';
import { useQuickNotes, useQuickNoteMutations } from '@/hooks/useIntranet';
import { PageHeader } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { relativeDate } from '@/lib/format';

// Sticky-note tints (theme-aware via low-opacity brand-neutral colors).
const noteTint: Record<QuickNoteColor, string> = {
  default: 'bg-surface border-line/15',
  yellow: 'bg-amber-400/10 border-amber-400/30',
  green: 'bg-emerald-400/10 border-emerald-400/30',
  blue: 'bg-sky-400/10 border-sky-400/30',
  pink: 'bg-pink-400/10 border-pink-400/30',
  purple: 'bg-violet-400/10 border-violet-400/30',
};
const swatch: Record<QuickNoteColor, string> = {
  default: 'bg-slate-400',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-400',
  blue: 'bg-sky-400',
  pink: 'bg-pink-400',
  purple: 'bg-violet-400',
};
const COLORS = Object.keys(noteTint) as QuickNoteColor[];

export default function QuickNotes() {
  const { data, isLoading, isError, refetch } = useQuickNotes();
  const [composing, setComposing] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Quick Notes"
        subtitle="Your private scratchpad — only you can see these."
        actions={
          <button className="ft-btn-primary" onClick={() => setComposing((c) => !c)}>
            <Plus className="h-4 w-4" /> New note
          </button>
        }
      />

      {composing && <NoteEditor onClose={() => setComposing(false)} />}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No notes yet" hint="Jot down a quick note — it's private to you." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note }: { note: QuickNote }) {
  const { update, remove } = useQuickNoteMutations();
  const [editing, setEditing] = useState(false);

  if (editing) return <NoteEditor note={note} onClose={() => setEditing(false)} />;

  return (
    <div className={`group relative flex flex-col rounded-card border p-4 ${noteTint[note.color]}`}>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Recolor */}
        <div className="flex items-center gap-1 rounded-full bg-black/5 px-1.5 py-1">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              onClick={() => update.mutate({ id: note.id, color: c })}
              className={`h-3 w-3 rounded-full ring-1 ring-black/10 ${swatch[c]} ${
                note.color === c ? 'ring-2 ring-accent' : ''
              }`}
            />
          ))}
        </div>
        <button
          className="rounded-full bg-black/5 p-1.5 text-danger hover:bg-danger/10"
          aria-label="Delete note"
          onClick={() => remove.mutate(note.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <button onClick={() => setEditing(true)} className="flex-1 text-left">
        {note.title && <p className="mb-1 pr-16 font-semibold text-content">{note.title}</p>}
        <p className="whitespace-pre-wrap text-sm text-content/90">{note.body}</p>
      </button>
      <p className="mt-3 text-[11px] text-subtle">Edited {relativeDate(note.updatedDateTime)}</p>
    </div>
  );
}

function NoteEditor({ note, onClose }: { note?: QuickNote; onClose: () => void }) {
  const { create, update } = useQuickNoteMutations();
  const [form, setForm] = useState({
    title: note?.title ?? '',
    body: note?.body ?? '',
    color: note?.color ?? ('default' as QuickNoteColor),
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (!form.body.trim()) return setError('Write something first.');
    try {
      if (note) await update.mutateAsync({ id: note.id, title: form.title || undefined, body: form.body, color: form.color });
      else await create.mutateAsync({ title: form.title || undefined, body: form.body, color: form.color });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className={`mb-4 rounded-card border p-4 ${noteTint[form.color]}`}>
      {error && <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="mb-2 flex items-center justify-between">
        <input
          className="w-full bg-transparent text-sm font-semibold text-content placeholder:text-subtle focus:outline-none"
          placeholder="Title (optional)"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <button className="ml-2 rounded-full p-1 text-subtle hover:bg-black/5" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        className="min-h-[90px] w-full resize-y bg-transparent text-sm text-content placeholder:text-subtle focus:outline-none"
        placeholder="Take a note…"
        value={form.body}
        onChange={(e) => set({ body: e.target.value })}
        autoFocus
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              onClick={() => set({ color: c })}
              className={`h-4 w-4 rounded-full ring-1 ring-black/10 ${swatch[c]} ${
                form.color === c ? 'ring-2 ring-accent' : ''
              }`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button className="ft-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ft-btn-primary" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : note ? 'Save' : 'Add note'}
          </button>
        </div>
      </div>
    </div>
  );
}
