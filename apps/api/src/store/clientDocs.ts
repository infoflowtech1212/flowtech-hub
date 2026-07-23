import { randomUUID } from 'node:crypto';
import type { ClientDocument } from '@flowtech/shared';

/** Mutable in-memory client documents (dev/mock). TODO(prod): SharePoint/Dataverse. */
let docs: ClientDocument[] = [
  {
    id: 'cd-001',
    name: 'Meridian - Q3 strategy deck.pdf',
    client: 'Meridian Holdings',
    category: 'Deliverable',
    size: 2_481_233,
    uploadedBy: 'Hannah Klein',
    uploadedDateTime: new Date(Date.now() - 8 * 864e5).toISOString(),
  },
  {
    id: 'cd-002',
    name: 'Onboarding pack.zip',
    client: 'Northwind Realty',
    category: 'Onboarding',
    size: 5_120_400,
    uploadedBy: 'Daniel Cho',
    uploadedDateTime: new Date(Date.now() - 15 * 864e5).toISOString(),
  },
];

const byDateDesc = (a: ClientDocument, b: ClientDocument) =>
  new Date(b.uploadedDateTime).getTime() - new Date(a.uploadedDateTime).getTime();

export const listClientDocs = (): ClientDocument[] => [...docs].sort(byDateDesc);

export function createClientDoc(input: Omit<ClientDocument, 'id' | 'uploadedDateTime'>): ClientDocument {
  const doc: ClientDocument = {
    id: `cd-${randomUUID().slice(0, 8)}`,
    uploadedDateTime: new Date().toISOString(),
    ...input,
  };
  docs.unshift(doc);
  return doc;
}

export function deleteClientDoc(id: string): boolean {
  const before = docs.length;
  docs = docs.filter((d) => d.id !== id);
  return docs.length < before;
}
