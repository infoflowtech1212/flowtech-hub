import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { QuickLink } from '@flowtech/shared';
import { useQuickLinks } from '@/hooks/useApi';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { AppLinkIcon } from '@/components/AppLinkIcon';

// Preferred display order (matches the SharePoint site); anything else follows.
const ORDER = [
  'Company Sites',
  'briqbi Quick Access',
  'Utility Links',
  'Quick Links',
  'Analytics',
  'Client Web Analytics',
  'Social Links',
];

export default function AppLinks() {
  const { data, isLoading, isError, refetch } = useQuickLinks();

  const groups = useMemo(() => {
    const map = new Map<string, QuickLink[]>();
    for (const l of data?.items ?? []) {
      const cat = l.category || 'Links';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(l);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = ORDER.indexOf(a[0]);
      const ib = ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="App Links" subtitle="Company apps, tools, and shortcuts." />

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {groups.map(([category, links]) => (
            <SectionCard key={category} title={category}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url || '#'}
                    target={l.url && l.url !== '#' ? '_blank' : undefined}
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-card border border-line/10 bg-surface-deep p-3 transition-colors hover:border-accent/40"
                  >
                    <AppLinkIcon label={l.label} url={l.url} logo={l.logo} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">{l.label}</span>
                    {l.url && l.url !== '#' ? (
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    ) : (
                      <span className="shrink-0 rounded-full bg-line/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-subtle">
                        set URL
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
