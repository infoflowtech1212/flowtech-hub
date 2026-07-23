import { randomUUID } from 'node:crypto';
import type { Announcement, QuickLink } from '@flowtech/shared';
import { mockAnnouncements, quickLinks as seedQuickLinks } from '../mocks.js';

/**
 * Mutable in-memory content store for admin-managed data (announcements, quick
 * links). Seeded from the mocks so the employee side has content on first boot;
 * admin edits persist for the session and show up immediately for employees.
 * TODO(prod): back with Dataverse tables.
 */
let announcements: Announcement[] = mockAnnouncements.map((a) => ({ ...a }));
let quickLinks: QuickLink[] = seedQuickLinks.map((q) => ({ ...q }));

const byDateDesc = (a: Announcement, b: Announcement) =>
  Number(b.pinned) - Number(a.pinned) ||
  new Date(b.publishedDateTime).getTime() - new Date(a.publishedDateTime).getTime();

// --- Announcements ---------------------------------------------------------
export const listAnnouncements = (): Announcement[] => [...announcements].sort(byDateDesc);

export function createAnnouncement(input: {
  title: string;
  body: string;
  author: string;
  category?: string;
  pinned?: boolean;
  imageUrl?: string;
}): Announcement {
  const a: Announcement = {
    id: `a-${randomUUID().slice(0, 8)}`,
    title: input.title,
    body: input.body,
    author: input.author,
    category: input.category,
    pinned: input.pinned ?? false,
    imageUrl: input.imageUrl,
    publishedDateTime: new Date().toISOString(),
  };
  announcements.unshift(a);
  return a;
}

export function updateAnnouncement(
  id: string,
  patch: Partial<Pick<Announcement, 'title' | 'body' | 'category' | 'pinned' | 'imageUrl'>>,
): Announcement | undefined {
  const a = announcements.find((x) => x.id === id);
  if (!a) return undefined;
  Object.assign(a, patch);
  return { ...a };
}

export function deleteAnnouncement(id: string): boolean {
  const before = announcements.length;
  announcements = announcements.filter((a) => a.id !== id);
  return announcements.length < before;
}

// --- Quick links -----------------------------------------------------------
export const listQuickLinks = (): QuickLink[] => [...quickLinks];

export function setQuickLinks(links: QuickLink[]): QuickLink[] {
  quickLinks = links.map((l) => ({ ...l, id: l.id || `ql-${randomUUID().slice(0, 6)}` }));
  return listQuickLinks();
}
