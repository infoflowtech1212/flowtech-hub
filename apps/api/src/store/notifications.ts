import { randomUUID } from 'node:crypto';
import type { Notification } from '@flowtech/shared';
import { mockNotifications, mockUser } from '../mocks.js';

/**
 * Per-user in-memory notifications store (dev / mock). In live mode these are
 * fed by Power Automate (approval outcomes, announcements) and would persist in
 * Dataverse. TODO(prod): Dataverse table + a push from the notify flow.
 */
const byUser = new Map<string, Notification[]>();

// Company-wide broadcasts everyone sees (e.g. new announcements, holidays).
// Read state is tracked per user so each person can dismiss independently.
const broadcasts: Notification[] = [];
const readBroadcasts = new Map<string, Set<string>>();
const readSet = (userId: string): Set<string> => {
  let s = readBroadcasts.get(userId);
  if (!s) readBroadcasts.set(userId, (s = new Set()));
  return s;
};

// Seed the mock user's feed so the UI has content on first boot.
byUser.set(mockUser.id, mockNotifications.map((n) => ({ ...n })));

const sorted = (list: Notification[]) =>
  [...list].sort(
    (a, b) =>
      Number(a.read) - Number(b.read) ||
      new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime(),
  );

/** A user's own notifications plus company broadcasts (with per-user read state). */
export const listNotifications = (userId: string): Notification[] => {
  const read = readSet(userId);
  const casts = broadcasts.map((b) => ({ ...b, read: read.has(b.id) }));
  return sorted([...(byUser.get(userId) ?? []), ...casts]);
};

export const unreadCount = (userId: string): number => {
  const read = readSet(userId);
  const own = (byUser.get(userId) ?? []).filter((n) => !n.read).length;
  const cast = broadcasts.filter((b) => !read.has(b.id)).length;
  return own + cast;
};

/** Broadcast a notification to every employee (shown in all feeds). */
export function pushBroadcast(input: { title: string; body?: string; kind: Notification['kind']; link?: string }): Notification {
  const notification: Notification = {
    id: `nb-${randomUUID().slice(0, 8)}`,
    read: false,
    createdDateTime: new Date().toISOString(),
    ...input,
  };
  broadcasts.unshift(notification);
  return notification;
}

/** Push a new notification onto a user's feed (used by the approval flow). */
export function pushNotification(
  userId: string,
  input: { title: string; body?: string; kind: Notification['kind']; link?: string },
): Notification {
  const notification: Notification = {
    id: `n-${randomUUID().slice(0, 8)}`,
    read: false,
    createdDateTime: new Date().toISOString(),
    ...input,
  };
  const list = byUser.get(userId) ?? [];
  list.unshift(notification);
  byUser.set(userId, list);
  return notification;
}

export function markRead(userId: string, id: string): boolean {
  const n = byUser.get(userId)?.find((x) => x.id === id);
  if (n) {
    n.read = true;
    return true;
  }
  // A broadcast — record read state for this user.
  if (broadcasts.some((b) => b.id === id)) {
    readSet(userId).add(id);
    return true;
  }
  return false;
}

export function markAllRead(userId: string): number {
  const list = byUser.get(userId) ?? [];
  let count = 0;
  for (const n of list) {
    if (!n.read) {
      n.read = true;
      count++;
    }
  }
  const read = readSet(userId);
  for (const b of broadcasts) {
    if (!read.has(b.id)) {
      read.add(b.id);
      count++;
    }
  }
  return count;
}
