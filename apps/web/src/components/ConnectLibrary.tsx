import { useState } from 'react';
import { FolderGit2, Link2 } from 'lucide-react';
import type { LibraryScope } from '@flowtech/shared';
import {
  useConnectLibrary,
  useSharePointLibraries,
  useSharePointSites,
  type SharePointSite,
} from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { SectionCard } from '@/components/ui/Page';
import { ErrorState, Skeleton } from '@/components/ui/states';

/**
 * Admin picker to connect a SharePoint document library (site → library) —
 * shown when the given scope has no library connected yet.
 */
export function ConnectLibrary({
  scope,
  title,
  onConnected,
}: {
  scope: LibraryScope;
  title: string;
  onConnected?: () => void;
}) {
  const { can } = useCan();
  const canManage = can('admin.settings.manage');
  const sites = useSharePointSites(canManage);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [driveId, setDriveId] = useState<string | null>(null);
  const libraries = useSharePointLibraries(siteId);
  const connect = useConnectLibrary();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <SectionCard>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FolderGit2 className="h-6 w-6 text-muted" />
          <p className="text-sm font-medium text-content">{title} isn't connected yet</p>
          <p className="text-xs text-muted">Ask a FlowTech Hub admin to connect a SharePoint library.</p>
        </div>
      </SectionCard>
    );
  }

  const site = sites.data?.items.find((s) => s.id === siteId);
  const library = libraries.data?.items.find((l) => l.id === driveId);

  async function save() {
    setError(null);
    if (!site || !library) return setError('Pick a site and a library.');
    try {
      await connect.mutateAsync({
        scope,
        siteId: site.id,
        siteName: site.name,
        driveId: library.id,
        libraryName: library.name,
        webUrl: (library as SharePointSite).webUrl,
      });
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect the library.');
    }
  }

  return (
    <SectionCard title={`Connect a SharePoint library for ${title}`}>
      <p className="mb-4 text-sm text-muted">
        Choose the SharePoint site and document library to use. Files browse, upload, and download
        will read and write directly to it.
      </p>

      {sites.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : sites.isError ? (
        <ErrorState message="Couldn't list SharePoint sites (check the Sites.ReadWrite.All permission)." onRetry={() => sites.refetch()} />
      ) : (
        <div className="space-y-3">
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Site</span>
            <select
              className="ft-input"
              value={siteId ?? ''}
              onChange={(e) => {
                setSiteId(e.target.value || null);
                setDriveId(null);
              }}
            >
              <option value="">Select a site…</option>
              {sites.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {siteId && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Library</span>
              {libraries.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <select className="ft-input" value={driveId ?? ''} onChange={(e) => setDriveId(e.target.value || null)}>
                  <option value="">Select a library…</option>
                  {libraries.data?.items.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          <button className="ft-btn-primary" onClick={save} disabled={!driveId || connect.isPending}>
            <Link2 className="h-4 w-4" /> {connect.isPending ? 'Connecting…' : 'Connect library'}
          </button>
        </div>
      )}
    </SectionCard>
  );
}
