import { randomUUID } from 'node:crypto';
import type { LegalDocument } from '@flowtech/shared';

/** Mutable in-memory legal register (dev/mock). TODO(prod): Dataverse table. */
let docs: LegalDocument[] = [
  {
    id: 'lg-001',
    title: 'Meridian master services agreement',
    type: 'agreement',
    status: 'signed',
    counterparty: 'Meridian Holdings',
    owner: 'Priya Nair',
    effectiveDate: new Date(Date.now() - 90 * 864e5).toISOString(),
    expiryDate: new Date(Date.now() + 275 * 864e5).toISOString(),
    createdDateTime: new Date(Date.now() - 95 * 864e5).toISOString(),
  },
  {
    id: 'lg-002',
    title: 'Contractor NDA — Diana Holic',
    type: 'nda',
    status: 'in-review',
    counterparty: 'Diana Holic',
    owner: 'Daniel Cho',
    createdDateTime: new Date(Date.now() - 4 * 864e5).toISOString(),
  },
  {
    id: 'lg-003',
    title: 'Data processing policy',
    type: 'policy',
    status: 'draft',
    owner: 'Alex Morgan',
    createdDateTime: new Date(Date.now() - 12 * 864e5).toISOString(),
  },
];

const byCreatedDesc = (a: LegalDocument, b: LegalDocument) =>
  new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime();

export const listLegal = (): LegalDocument[] => [...docs].sort(byCreatedDesc);

export function createLegal(input: Omit<LegalDocument, 'id' | 'createdDateTime'>): LegalDocument {
  const doc: LegalDocument = {
    id: `lg-${randomUUID().slice(0, 8)}`,
    createdDateTime: new Date().toISOString(),
    ...input,
  };
  docs.unshift(doc);
  return doc;
}

export function updateLegal(id: string, patch: Partial<Omit<LegalDocument, 'id'>>): LegalDocument | undefined {
  const d = docs.find((x) => x.id === id);
  if (!d) return undefined;
  Object.assign(d, patch);
  return { ...d };
}

export function deleteLegal(id: string): boolean {
  const before = docs.length;
  docs = docs.filter((d) => d.id !== id);
  return docs.length < before;
}
