import { useAnnouncements } from '@/hooks/useApi';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { relativeDate } from '@/lib/format';

export default function News() {
  const { data, isLoading, isError, refetch } = useAnnouncements();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Company news" subtitle="Announcements from across FlowTech." />
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <div className="space-y-3">
          {data.items.map((a) => (
            <SectionCard key={a.id}>
              {a.imageUrl && (
                <img
                  src={a.imageUrl}
                  alt=""
                  className="mb-3 max-h-56 w-full rounded-card border border-line/10 object-cover"
                />
              )}
              <div className="mb-1 flex items-center gap-2">
                {a.pinned && <Badge tone="accent">Pinned</Badge>}
                {a.category && <Badge>{a.category}</Badge>}
              </div>
              <h2 className="text-lg font-bold">{a.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
              <p className="mt-3 text-xs text-subtle">
                {a.author} · {relativeDate(a.publishedDateTime)}
              </p>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
