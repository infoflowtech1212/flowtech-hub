import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Copy, Download, File, Folder, Home, Search, Share2, Upload, X } from 'lucide-react';
import type { Capability, DocumentItem, LibraryScope } from '@flowtech/shared';
import { useDocuments, useDocumentSearch, useLibraryConnection, useShareDocument } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { useCan } from '@/hooks/useCan';
import { ConnectLibrary } from '@/components/ConnectLibrary';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { api, ApiRequestError } from '@/lib/api';
import { formatBytes, relativeDate } from '@/lib/format';

type Scope = LibraryScope;

// Courses and Client Documents use their own dedicated capabilities rather
// than 'documents.*' — see docCapability() in routes/api.ts for the matching
// server-side check. ('documents.view' is baseline for every employee;
// 'documents.upload'/'.share' are still per-person grants, same as here.)
const capFor = (scope: Scope, action: 'upload' | 'share'): Capability => {
  if (scope === 'courses') return `courses.${action}` as Capability;
  if (scope === 'clientdocs') return 'clientdocs.manage';
  return `documents.${action}` as Capability;
};

/**
 * SharePoint document browser for a given library scope. Shows a connection
 * picker until an admin connects a library, then browse / upload / download —
 * all reading and writing to that SharePoint library.
 */
export function DocumentBrowser({ scope, title }: { scope: Scope; title: string }) {
  const [path, setPath] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 350);
  const searching = debouncedQ.trim().length > 1;

  const browse = useDocuments(path, scope);
  const search = useDocumentSearch(debouncedQ, scope);
  const active = searching ? search : browse;

  const { can } = useCan();
  const conn = useLibraryConnection(scope);
  const connection = conn.data?.connection ?? null;
  const fixed = conn.data?.fixed ?? false; // pinned library — no picker/change
  const [reconnect, setReconnect] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shareFor, setShareFor] = useState<DocumentItem | null>(null);
  const canShare = can(capFor(scope, 'share'));
  const qc = useQueryClient();

  const items = active.data?.items ?? [];
  const folders = items.filter((d) => d.kind === 'folder');
  const files = items.filter((d) => d.kind === 'file');
  const segments = path.split('/').filter(Boolean);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      await api.uploadFile<DocumentItem>(
        `/documents/content?name=${encodeURIComponent(file.name)}&path=${encodeURIComponent(path)}&scope=${scope}`,
        file,
      );
      await qc.invalidateQueries({ queryKey: ['documents', scope, path] });
    } catch (err) {
      setUploadError(err instanceof ApiRequestError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  if (conn.isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={title} subtitle="Connecting to SharePoint…" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!connection || reconnect) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={title} subtitle="Connect your SharePoint document library." />
        <ConnectLibrary scope={scope} title={title} onConnected={() => setReconnect(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={title}
        subtitle={`Connected to ${connection.siteName} · ${connection.libraryName}`}
        actions={
          <div className="flex items-center gap-2">
            {can('admin.settings.manage') && !fixed && (
              <button className="ft-btn-ghost" onClick={() => setReconnect(true)}>
                Change library
              </button>
            )}
            {can(capFor(scope, 'upload')) && (
              <>
                <input ref={fileInput} type="file" className="hidden" onChange={onUpload} />
                <button
                  className="ft-btn-primary"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading || searching}
                  title={searching ? 'Clear search to upload' : 'Upload to this folder'}
                >
                  <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-pill border border-line/10 bg-surface-deep px-4 py-2.5">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the library…"
          aria-label="Search documents"
          className="w-full bg-transparent text-sm text-content placeholder:text-subtle focus:outline-none"
        />
      </div>

      {!searching && (
        <nav className="mb-3 flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
          <button className="flex items-center gap-1 hover:text-accent-bright" onClick={() => setPath('')}>
            <Home className="h-4 w-4" /> Library
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-subtle" />
              <button
                className="hover:text-accent-bright"
                onClick={() => setPath('/' + segments.slice(0, i + 1).join('/'))}
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>
      )}

      {uploadError && (
        <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{uploadError}</p>
      )}

      {active.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : active.isError ? (
        <ErrorState onRetry={() => active.refetch()} />
      ) : !items.length ? (
        <EmptyState title={searching ? 'No matches' : 'This folder is empty'} />
      ) : (
        <div className="space-y-4">
          {folders.length > 0 && (
            <SectionCard title="Folders">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setQ('');
                      setPath(f.path);
                    }}
                    className="flex items-center gap-2 rounded-card border border-line/10 bg-surface-deep p-3 text-left hover:border-accent/40"
                  >
                    <Folder className="h-4 w-4 text-accent-bright" />
                    <span className="truncate text-sm text-content">{f.name}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {files.length > 0 && (
            <SectionCard title="Files">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                      <th className="pb-2 font-semibold">Name</th>
                      <th className="pb-2 font-semibold">Modified</th>
                      <th className="pb-2 font-semibold">Size</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <tr key={f.id} className="border-t border-line/5 hover:bg-line/5">
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-muted" />
                            <span className="text-content">{f.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-muted">
                          {f.lastModifiedBy ?? '—'}
                          {f.lastModifiedDateTime && (
                            <span className="text-subtle"> · {relativeDate(f.lastModifiedDateTime)}</span>
                          )}
                        </td>
                        <td className="py-2.5 text-muted">{formatBytes(f.size)}</td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canShare && (
                              <button
                                onClick={() => setShareFor(f)}
                                className="inline-flex rounded-lg p-1.5 text-muted hover:bg-line/10 hover:text-accent-bright"
                                aria-label={`Share ${f.name}`}
                                title="Create a share link"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            )}
                            <a
                              href={`/api/documents/${f.id}/download?scope=${scope}`}
                              className="inline-flex rounded-lg p-1.5 text-muted hover:bg-line/10 hover:text-accent-bright"
                              aria-label={`Download ${f.name}`}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {shareFor && <ShareDialog item={shareFor} scope={scope} onClose={() => setShareFor(null)} />}
    </div>
  );
}

function ShareDialog({ item, scope, onClose }: { item: DocumentItem; scope: Scope; onClose: () => void }) {
  const share = useShareDocument(scope);
  const [type, setType] = useState<'view' | 'edit'>('view');
  const [linkScope, setLinkScope] = useState<'organization' | 'anonymous'>('organization');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError(null);
    setCopied(false);
    try {
      const res = await share.mutateAsync({ id: item.id, type, linkScope });
      setLink(res.webUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a share link.');
    }
  }

  // Generate a default (view, organization) link as soon as the dialog opens.
  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-card border border-line/10 bg-elevated p-5 shadow-card">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-line/5" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-content">
          <Share2 className="h-4 w-4 text-accent-bright" /> Share “{item.name}”
        </h3>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Access</span>
            <select className="ft-input" value={type} onChange={(e) => { setType(e.target.value as 'view' | 'edit'); setLink(null); }}>
              <option value="view">View only</option>
              <option value="edit">Can edit</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Who</span>
            <select className="ft-input" value={linkScope} onChange={(e) => { setLinkScope(e.target.value as 'organization' | 'anonymous'); setLink(null); }}>
              <option value="organization">People in FlowTech</option>
              <option value="anonymous">Anyone with the link</option>
            </select>
          </label>
        </div>

        {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

        {link ? (
          <div className="mt-4">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Share link</span>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="ft-input flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button
                className="ft-btn-primary shrink-0"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <button className="ft-btn-primary mt-4 w-full" onClick={generate} disabled={share.isPending}>
            {share.isPending ? 'Creating link…' : 'Create share link'}
          </button>
        )}
      </div>
    </div>
  );
}
