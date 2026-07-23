import { randomUUID } from 'node:crypto';
import type { QuickNote } from '@flowtech/shared';

/**
 * Private per-employee quick notes (dev/mock). Each user only ever sees their
 * own notes — the store is keyed by owner id. TODO(prod): back with a Dataverse
 * table scoped by owner (personal, no notification), like the personal vault.
 */
const byOwner = new Map<string, QuickNote[]>();

const byUpdatedDesc = (a: QuickNote, b: QuickNote) =>
  new Date(b.updatedDateTime).getTime() - new Date(a.updatedDateTime).getTime();

export const listQuickNotes = (ownerId: string): QuickNote[] =>
  [...(byOwner.get(ownerId) ?? [])].sort(byUpdatedDesc);

export function createQuickNote(
  ownerId: string,
  input: { title?: string; body: string; color?: QuickNote['color'] },
): QuickNote {
  const now = new Date().toISOString();
  const note: QuickNote = {
    id: `qn-${randomUUID().slice(0, 8)}`,
    title: input.title,
    body: input.body,
    color: input.color ?? 'default',
    createdDateTime: now,
    updatedDateTime: now,
  };
  const list = byOwner.get(ownerId) ?? [];
  list.unshift(note);
  byOwner.set(ownerId, list);
  return note;
}

export function updateQuickNote(
  ownerId: string,
  id: string,
  patch: Partial<Pick<QuickNote, 'title' | 'body' | 'color'>>,
): QuickNote | undefined {
  const note = byOwner.get(ownerId)?.find((n) => n.id === id);
  if (!note) return undefined;
  Object.assign(note, patch, { updatedDateTime: new Date().toISOString() });
  return { ...note };
}

export function deleteQuickNote(ownerId: string, id: string): boolean {
  const list = byOwner.get(ownerId);
  if (!list) return false;
  const next = list.filter((n) => n.id !== id);
  if (next.length === list.length) return false;
  byOwner.set(ownerId, next);
  return true;
}
