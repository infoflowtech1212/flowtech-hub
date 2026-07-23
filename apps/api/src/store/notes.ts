import { randomUUID } from 'node:crypto';
import type { AdminNote } from '@flowtech/shared';

/**
 * Admin-only notes / ideas board (dev/mock). These are private to
 * administrators — the route is gated on `notes.view`, which only the
 * Administrator role holds. TODO(prod): mirror text to a Dataverse
 * `flowtech_adminnote` table (see ../dataverse/notes.ts).
 */
let notes: AdminNote[] = [
  {
    id: 'nt-001',
    title: 'Q3 tooling review',
    body: 'Let’s audit unused SaaS seats before the next renewal cycle — Figma and Adobe both look over-provisioned.',
    authorId: 'seed',
    authorName: 'FlowTech Admin',
    pinned: true,
    createdDateTime: new Date(Date.now() - 4 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 4 * 864e5).toISOString(),
  },
];

const rank = (a: AdminNote, b: AdminNote) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return new Date(b.updatedDateTime).getTime() - new Date(a.updatedDateTime).getTime();
};

export const listNotes = (): AdminNote[] => [...notes].sort(rank);

export function createNote(input: {
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  pinned?: boolean;
}): AdminNote {
  const now = new Date().toISOString();
  const note: AdminNote = {
    id: `nt-${randomUUID().slice(0, 8)}`,
    createdDateTime: now,
    updatedDateTime: now,
    ...input,
  };
  notes.unshift(note);
  return note;
}

export function updateNote(id: string, patch: Partial<Pick<AdminNote, 'title' | 'body' | 'pinned'>>): AdminNote | undefined {
  const note = notes.find((n) => n.id === id);
  if (!note) return undefined;
  Object.assign(note, patch, { updatedDateTime: new Date().toISOString() });
  return { ...note };
}

export function deleteNote(id: string): boolean {
  const before = notes.length;
  notes = notes.filter((n) => n.id !== id);
  return notes.length < before;
}
