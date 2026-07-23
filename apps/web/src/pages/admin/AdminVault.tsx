import { KeyRound, Trash2 } from 'lucide-react';
import { useVault, useVaultMutations } from '@/hooks/useIntranet';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { relativeDate } from '@/lib/format';

/** Admin view of the shared (open) password vault — review and remove entries. */
export default function AdminVault() {
  const { data, isLoading, isError, refetch } = useVault('open');
  const { remove } = useVaultMutations('open');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Shared Vault" subtitle="Review and manage entries in the shared (open) password vault." />
      <SectionCard title={data ? `${data.items.length} shared entries` : 'Shared entries'}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No shared entries" />
        ) : (
          <ul className="divide-y divide-line/5">
            {data.items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent-bright">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{e.title}</p>
                  <p className="truncate text-xs text-muted">
                    {e.username && `${e.username} · `}
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer" className="text-accent-bright hover:underline">
                        link
                      </a>
                    )}
                    {e.ownerName && ` · added by ${e.ownerName}`} · {relativeDate(e.updatedDateTime)}
                  </p>
                </div>
                {e.category && <Badge>{e.category}</Badge>}
                {e.secretSet && <Badge tone="neutral">secret set</Badge>}
                <button className="ft-btn-ghost px-2 py-1" onClick={() => remove.mutate(e.id)} aria-label="Delete entry">
                  <Trash2 className="h-4 w-4 text-danger" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
