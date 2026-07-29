import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DocumentItem, Paged } from '@flowtech/shared';
import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import type { AuthContext } from '../auth/middleware.js';
import { graphClientFor } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DriveRef {
  siteId: string;
  driveId: string;
}

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  folder?: { childCount: number };
  file?: { mimeType?: string };
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  parentReference?: { path?: string };
}

// Site + drive IDs are stable; cache them for an hour so we resolve by name once.
const driveCache = new TtlCache<DriveRef>(60 * 60 * 1000);

/** A document library connected via the in-app picker (admin-selected). */
export interface LibraryConnection {
  scope: 'documents' | 'clientdocs';
  siteId: string;
  siteName: string;
  driveId: string;
  libraryName: string;
  webUrl?: string;
}
// Selected/pinned libraries, keyed by scope. Persisted to disk (DATA_DIR in
// production) so the connection survives redeploys and a manual pick sticks.
const CONN_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'connections.json')
  : path.resolve(__dirname, '../../.connections.json');
const connections = new Map<string, LibraryConnection>();
try {
  (JSON.parse(readFileSync(CONN_PATH, 'utf8')) as LibraryConnection[]).forEach((c) => connections.set(c.scope, c));
} catch {
  /* no saved connections yet */
}
function persistConnections() {
  try {
    writeFileSync(CONN_PATH, JSON.stringify([...connections.values()]), 'utf8');
  } catch {
    /* best-effort */
  }
}
export const getConnection = (scope: 'documents' | 'clientdocs') => connections.get(scope) ?? null;
export const setConnection = (c: LibraryConnection) => {
  connections.set(c.scope, c);
  persistConnections();
};

// Pinned/fixed libraries resolved by name so the Document Center "just works"
// without anyone using the picker. Override the names via env if the SharePoint
// setup differs. `null` disables pinning for that scope (picker required).
const FIXED_LIBRARY: Record<'documents' | 'clientdocs', { siteName: string; libraryName: string } | null> = {
  documents: {
    siteName: process.env.DOC_SITE_NAME || 'FlowTech',
    libraryName: process.env.DOC_LIBRARY_NAME || 'FlowTech Internal',
  },
  clientdocs: {
    siteName: process.env.CLIENTDOC_SITE_NAME || 'FlowTech',
    libraryName: process.env.CLIENTDOC_LIBRARY_NAME || 'Client Access',
  },
};

export const isFixedLibrary = (scope: 'documents' | 'clientdocs') => FIXED_LIBRARY[scope] !== null;

/**
 * Ensure a library is connected for a scope: returns an admin-picked connection
 * if present, otherwise auto-resolves the pinned library by site + library name
 * and caches it. Returns null (→ picker) if it can't be resolved; resolution
 * errors are swallowed so the page still renders.
 */
export async function ensureConnection(
  auth: AuthContext,
  scope: 'documents' | 'clientdocs',
): Promise<LibraryConnection | null> {
  const existing = getConnection(scope);
  if (existing) return existing;
  const fixed = FIXED_LIBRARY[scope];
  if (!fixed) return null;
  try {
    const sites = await listSites(auth);
    const wantSite = fixed.siteName.toLowerCase();
    const wantLib = fixed.libraryName.toLowerCase();
    // There can be several similarly-named sites (e.g. multiple "FlowTech").
    // Consider every site whose name matches, exact-name matches first, and pick
    // the FIRST one that actually contains the target library.
    const candidates = sites
      .filter((s) => s.name.toLowerCase().includes(wantSite))
      .sort((a, b) => Number(b.name.toLowerCase() === wantSite) - Number(a.name.toLowerCase() === wantSite));
    for (const site of candidates) {
      try {
        const libs = await listLibraries(auth, site.id);
        const lib =
          libs.find((l) => l.name?.toLowerCase() === wantLib) ??
          libs.find((l) => l.name?.toLowerCase().includes(wantLib));
        if (lib) {
          const conn: LibraryConnection = {
            scope,
            siteId: site.id,
            siteName: site.name,
            driveId: lib.id,
            libraryName: lib.name,
            webUrl: lib.webUrl,
          };
          setConnection(conn);
          return conn;
        }
      } catch {
        /* this site's drives weren't readable — try the next candidate */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** List SharePoint sites the user can access (for the library picker). */
export async function listSites(auth: AuthContext) {
  const client = graphClientFor(auth.getGraphToken);
  const res = await client.api('/sites?search=*').select(['id', 'displayName', 'name', 'webUrl']).get();
  return (res.value as { id: string; displayName?: string; name?: string; webUrl?: string }[])
    .map((s) => ({ id: s.id, name: s.displayName || s.name || s.webUrl || s.id, webUrl: s.webUrl }))
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** List document libraries (drives) in a site (for the library picker). */
export async function listLibraries(auth: AuthContext, siteId: string) {
  const client = graphClientFor(auth.getGraphToken);
  const res = await client.api(`/sites/${siteId}/drives`).select(['id', 'name', 'webUrl']).get();
  return (res.value as { id: string; name: string; webUrl?: string }[]).map((d) => ({
    id: d.id,
    name: d.name,
    webUrl: d.webUrl,
  }));
}

/**
 * Resolve the SharePoint document library to Graph IDs. Prefers the in-app
 * connection (picker); falls back to the SHAREPOINT_* env config.
 */
export async function resolveDrive(
  auth: AuthContext,
  scope: 'documents' | 'clientdocs' = 'documents',
): Promise<DriveRef> {
  const conn = getConnection(scope);
  if (conn) return { siteId: conn.siteId, driveId: conn.driveId };

  const { hostname, sitePath, libraryName } = config.sharepoint;
  if (!hostname || !sitePath) {
    throw new Error('SharePoint not connected — an admin must connect a library on the Documents page.');
  }
  const cacheKey = `${hostname}${sitePath}::${libraryName}`;
  return driveCache.wrap(cacheKey, async () => {
    const client = graphClientFor(auth.getGraphToken);
    const site = await client.api(`/sites/${hostname}:${sitePath}`).select(['id']).get();
    const drives = await client.api(`/sites/${site.id}/drives`).select(['id', 'name']).get();
    const drive =
      (drives.value as { id: string; name: string }[]).find(
        (d) => d.name?.toLowerCase() === libraryName.toLowerCase(),
      ) ?? drives.value[0];
    if (!drive) throw new Error(`Document library "${libraryName}" not found on the site`);
    return { siteId: site.id, driveId: drive.id };
  });
}

function toDocument(item: GraphDriveItem): DocumentItem {
  const parentPath = item.parentReference?.path?.replace(/^\/drives\/[^/]+\/root:/, '') ?? '';
  return {
    id: item.id,
    name: item.name,
    kind: item.folder ? 'folder' : 'file',
    size: item.size,
    mimeType: item.file?.mimeType,
    webUrl: item.webUrl,
    lastModifiedDateTime: item.lastModifiedDateTime,
    lastModifiedBy: item.lastModifiedBy?.user?.displayName,
    path: `${parentPath}/${item.name}`.replace(/\/+/g, '/'),
  };
}

const CHILD_SELECT = [
  'id',
  'name',
  'size',
  'webUrl',
  'folder',
  'file',
  'lastModifiedDateTime',
  'lastModifiedBy',
  'parentReference',
];

type LibScope = 'documents' | 'clientdocs';

/** List folders + files at a library path ('' or '/' = root). Folders first. */
export async function listChildren(
  auth: AuthContext,
  path = '',
  cursor?: string,
  scope: LibScope = 'documents',
): Promise<Paged<DocumentItem>> {
  const client = graphClientFor(auth.getGraphToken);
  if (cursor) {
    const page = await client.api(cursor).get();
    return { items: (page.value as GraphDriveItem[]).map(toDocument), nextCursor: page['@odata.nextLink'] ?? null };
  }

  const { driveId } = await resolveDrive(auth, scope);
  const clean = path.replace(/^\/+|\/+$/g, '');
  const endpoint = clean
    ? `/drives/${driveId}/root:/${encodeURI(clean)}:/children`
    : `/drives/${driveId}/root/children`;

  const page = await client.api(endpoint).select(CHILD_SELECT).top(100).get();
  const items = (page.value as GraphDriveItem[]).map(toDocument);
  items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
  return { items, nextCursor: page['@odata.nextLink'] ?? null };
}

/** Full-text search across the library. */
export async function searchDocuments(
  auth: AuthContext,
  q: string,
  scope: LibScope = 'documents',
): Promise<Paged<DocumentItem>> {
  const client = graphClientFor(auth.getGraphToken);
  const { driveId } = await resolveDrive(auth, scope);
  const page = await client.api(`/drives/${driveId}/root/search(q='${encodeURIComponent(q)}')`).get();
  return { items: (page.value as GraphDriveItem[]).map(toDocument), nextCursor: page['@odata.nextLink'] ?? null };
}

/**
 * Simple upload (files < 4 MB) via PUT .../content. Larger files need an upload
 * session — TODO(step-3 follow-up) when we wire chunked uploads for big docs.
 */
export async function uploadFile(
  auth: AuthContext,
  path: string,
  filename: string,
  content: Buffer,
  scope: LibScope = 'documents',
): Promise<DocumentItem> {
  const client = graphClientFor(auth.getGraphToken);
  const { driveId } = await resolveDrive(auth, scope);
  const clean = path.replace(/^\/+|\/+$/g, '');
  const target = clean ? `${clean}/${filename}` : filename;
  const item: GraphDriveItem = await client
    .api(`/drives/${driveId}/root:/${encodeURI(target)}:/content`)
    .put(content);
  return toDocument(item);
}

/**
 * Create a sharing link for a drive item (Graph createLink). `type` is view or
 * edit; `scope` is 'organization' (anyone in the tenant with the link) or
 * 'anonymous' (anyone with the link — external). Returns the shareable URL.
 */
export async function createShareLink(
  auth: AuthContext,
  itemId: string,
  opts: { type?: 'view' | 'edit'; scope?: 'organization' | 'anonymous' } = {},
  scope: LibScope = 'documents',
): Promise<{ webUrl: string; name: string }> {
  const client = graphClientFor(auth.getGraphToken);
  const { driveId } = await resolveDrive(auth, scope);
  const meta: GraphDriveItem = await client.api(`/drives/${driveId}/items/${itemId}`).select(['name']).get();
  const res = await client.api(`/drives/${driveId}/items/${itemId}/createLink`).post({
    type: opts.type ?? 'view',
    scope: opts.scope ?? 'organization',
  });
  return { webUrl: res?.link?.webUrl ?? '', name: meta.name };
}

/** Stream a file's bytes for download through the BFF. */
export async function downloadFile(
  auth: AuthContext,
  itemId: string,
  scope: LibScope = 'documents',
): Promise<{ stream: NodeJS.ReadableStream; name: string; mimeType?: string }> {
  const client = graphClientFor(auth.getGraphToken);
  const { driveId } = await resolveDrive(auth, scope);
  const meta: GraphDriveItem = await client
    .api(`/drives/${driveId}/items/${itemId}`)
    .select(['name', 'file'])
    .get();
  const stream = (await client.api(`/drives/${driveId}/items/${itemId}/content`).getStream()) as NodeJS.ReadableStream;
  return { stream, name: meta.name, mimeType: meta.file?.mimeType };
}
