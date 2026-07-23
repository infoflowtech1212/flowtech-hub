import { useRef, useState } from 'react';
import { ImagePlus, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import type { Announcement } from '@flowtech/shared';
import { useAdminAnnouncements, useAnnouncementMutations } from '@/hooks/useAdmin';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';
import { fileToDataUri } from '@/lib/image';

export default function AdminAnnouncements() {
  const list = useAdminAnnouncements();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Announcements"
        subtitle="Publish company news. Changes appear on employees' dashboards immediately."
        actions={
          <button className="ft-btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New announcement
          </button>
        }
      />

      {editing && (
        <AnnouncementForm
          announcement={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data?.items.length ? (
        <EmptyState title="No announcements yet" hint="Create the first company announcement." />
      ) : (
        <div className="space-y-3">
          {list.data.items.map((a) => (
            <SectionCard key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    {a.pinned && <Badge tone="accent">Pinned</Badge>}
                    {a.category && <Badge>{a.category}</Badge>}
                  </div>
                  <h2 className="text-base font-bold">{a.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</p>
                  <p className="mt-2 text-[11px] text-subtle">
                    {a.author} · {relativeDate(a.publishedDateTime)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="rounded-lg p-2 text-muted hover:bg-line/5 hover:text-accent-bright"
                    onClick={() => setEditing(a)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <DeleteButton id={a.id} />
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const { remove } = useAnnouncementMutations();
  return (
    <button
      className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"
      onClick={() => confirm('Delete this announcement?') && remove.mutate(id)}
      disabled={remove.isPending}
      aria-label="Delete"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function AnnouncementForm({
  announcement,
  onDone,
}: {
  announcement?: Announcement;
  onDone: () => void;
}) {
  const { create, update } = useAnnouncementMutations();
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [category, setCategory] = useState(announcement?.category ?? '');
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [imageUrl, setImageUrl] = useState(announcement?.imageUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setImageUrl(await fileToDataUri(file, 1200, 0.82)); // banner-sized
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that image.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save() {
    setError(null);
    if (title.trim().length < 2) return setError('Title is required.');
    if (body.trim().length < 1) return setError('Body is required.');
    try {
      // Send imageUrl always (empty string clears it) so removal persists.
      const payload = { title, body, category: category || undefined, pinned, imageUrl };
      if (announcement) await update.mutateAsync({ id: announcement.id, ...payload });
      else await create.mutateAsync(payload);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <SectionCard className="mb-4" title={announcement ? 'Edit announcement' : 'New announcement'}>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="space-y-3">
        <input
          className="ft-input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="ft-input min-h-[100px]"
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {/* Banner image */}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Banner image (optional)</p>
          {imageUrl ? (
            <div className="relative inline-block">
              <img src={imageUrl} alt="" className="h-28 w-full max-w-xs rounded-card border border-line/10 object-cover" />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ft-btn-ghost"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus className="h-4 w-4" /> Upload image
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            className="ft-input max-w-[200px]"
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              className="accent-[color:rgb(var(--ft-accent))]"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            <Pin className="h-4 w-4" /> Pinned
          </label>
        </div>
        <div className="flex justify-end gap-2">
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
