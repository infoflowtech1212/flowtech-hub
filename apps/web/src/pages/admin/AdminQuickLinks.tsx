import { useEffect, useRef, useState } from 'react';
import { GripVertical, ImagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import type { QuickLink } from '@flowtech/shared';
import { useAdminQuickLinks, useSaveQuickLinks } from '@/hooks/useAdmin';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { fileToDataUri } from '@/lib/image';

export default function AdminQuickLinks() {
  const { data, isLoading, isError, refetch } = useAdminQuickLinks();
  const save = useSaveQuickLinks();
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.items) setLinks(data.items);
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const update = (i: number, patch: Partial<QuickLink>) =>
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLinks((prev) => prev.filter((_, idx) => idx !== i));
  const add = () =>
    setLinks((prev) => [...prev, { id: '', label: '', url: 'https://', category: '' }]);

  async function persist() {
    setSaved(false);
    await save.mutateAsync(links.filter((l) => l.label && l.url));
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Quick links"
        subtitle="Shortcuts shown on every employee's dashboard."
        actions={
          <button className="ft-btn-primary" onClick={persist} disabled={save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save'}
          </button>
        }
      />

      <SectionCard>
        {saved && !save.isPending && (
          <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">Quick links saved.</p>
        )}
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-line/10 bg-surface-deep p-2">
              <GripVertical className="h-4 w-4 shrink-0 text-subtle" />
              <LogoPicker logo={l.logo} onChange={(logo) => update(i, { logo })} />
              <input
                className="ft-input max-w-[150px]"
                placeholder="Label"
                value={l.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <input
                className="ft-input flex-1"
                placeholder="https://…"
                value={l.url}
                onChange={(e) => update(i, { url: e.target.value })}
              />
              <input
                className="ft-input max-w-[150px]"
                placeholder="Category"
                value={l.category ?? ''}
                onChange={(e) => update(i, { category: e.target.value })}
                list="ql-categories"
              />
              <button
                className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"
                onClick={() => remove(i)}
                aria-label="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <datalist id="ql-categories">
          {[...new Set(links.map((l) => l.category).filter(Boolean))].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button className="ft-btn-ghost mt-3" onClick={add}>
          <Plus className="h-4 w-4" /> Add link
        </button>
        <p className="mt-3 text-[11px] text-subtle">
          Links are grouped by <strong>category</strong> on the App Links page (e.g. Company Sites,
          Utility Links, Social Links). Use <code>#</code> as the URL if you'll set the real link later.
          Add a <strong>logo</strong> per link (click the tile) — otherwise the site's favicon or initials show.
        </p>
      </SectionCard>
    </div>
  );
}

/** Small square logo upload/preview for a quick link. */
function LogoPicker({ logo, onChange }: { logo?: string; onChange: (logo: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToDataUri(file, 128, 0.9)); // small logo
    } catch {
      /* ignore — keep existing */
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-line/10 bg-surface text-muted hover:border-accent/40"
        title={logo ? 'Change logo' : 'Add logo'}
      >
        {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : busy ? <span className="text-[9px]">…</span> : <ImagePlus className="h-4 w-4" />}
      </button>
      {logo && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
          aria-label="Remove logo"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </div>
  );
}
