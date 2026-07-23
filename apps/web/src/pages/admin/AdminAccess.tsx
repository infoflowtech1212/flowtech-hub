import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { Capability } from '@flowtech/shared';
import { useDocumentAccess, useSaveAccess, type AccessRow } from '@/hooks/useAdmin';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

// The document capabilities admins can grant per person.
const DOC_CAPS: { key: Capability; label: string; hint: string }[] = [
  { key: 'documents.view', label: 'Documents', hint: 'View the internal document library' },
  { key: 'documents.upload', label: 'Upload', hint: 'Upload to internal documents' },
  { key: 'documents.share', label: 'Share', hint: 'Create shareable file links' },
  { key: 'clientdocs.view', label: 'Client Docs', hint: 'View the client documents library' },
  { key: 'clientdocs.manage', label: 'Manage Client', hint: 'Upload/remove client documents' },
];

export default function AdminAccess() {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const access = useDocumentAccess(debounced);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Document Access"
        subtitle="Grant per-person access to Documents and Client Documents. Client Documents are private by default."
      />

      <SectionCard>
        <div className="mb-3 flex items-center gap-2 rounded-pill border border-line/10 bg-surface-deep px-3 py-2">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            className="w-full bg-transparent text-sm text-content placeholder:text-subtle focus:outline-none"
          />
        </div>

        {access.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : access.isError ? (
          <ErrorState onRetry={() => access.refetch()} />
        ) : !access.data?.items.length ? (
          <EmptyState title="No people" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line/10 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Person</th>
                  {DOC_CAPS.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-center font-medium" title={c.hint}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/5">
                {access.data.items.map((row) => (
                  <AccessRowItem key={row.userId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function AccessRowItem({ row }: { row: AccessRow }) {
  const save = useSaveAccess();
  const [grants, setGrants] = useState<Capability[]>(row.grants);
  const [saved, setSaved] = useState(false);
  useEffect(() => setGrants(row.grants), [row.grants]);

  const toggle = (cap: Capability) => {
    const next = grants.includes(cap) ? grants.filter((g) => g !== cap) : [...grants, cap];
    setGrants(next);
    setSaved(false);
    save.mutate(
      { userId: row.userId, grants: next },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1200); } },
    );
  };

  return (
    <tr>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <Avatar name={row.displayName} src={`/api/directory/${row.userId}/photo`} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium text-content">
              {row.displayName}
              {saved && <span className="ml-2 text-[11px] text-success">saved</span>}
            </p>
            <p className="truncate text-xs text-subtle">{row.jobTitle ?? row.mail}</p>
          </div>
        </div>
      </td>
      {DOC_CAPS.map((c) => (
        <td key={c.key} className="px-2 py-2.5 text-center">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[color:rgb(var(--ft-accent))]"
            checked={grants.includes(c.key)}
            onChange={() => toggle(c.key)}
            aria-label={`${c.label} for ${row.displayName}`}
          />
        </td>
      ))}
    </tr>
  );
}
