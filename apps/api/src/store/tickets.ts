import { randomUUID } from 'node:crypto';
import type { Ticket } from '@flowtech/shared';

/** Mutable in-memory help-desk tickets (dev/mock). TODO(prod): Dataverse table. */
let tickets: Ticket[] = [
  {
    id: 'tk-001',
    subject: "Can't access the shared Documents folder",
    description: 'Getting a permission error opening the Delivery folder.',
    category: 'Access',
    priority: 'high',
    status: 'open',
    requesterId: 'p-004',
    requesterName: 'Sofia Reyes',
    createdDateTime: new Date(Date.now() - 3 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 3 * 864e5).toISOString(),
  },
  {
    id: 'tk-002',
    subject: 'Add Diana Holic to leasing discovery invites',
    category: 'Request',
    priority: 'medium',
    status: 'in-progress',
    requesterId: 'p-006',
    requesterName: 'Hannah Klein',
    assignee: 'Marcus Webb',
    createdDateTime: new Date(Date.now() - 5 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 1 * 864e5).toISOString(),
  },
];

const byUpdatedDesc = (a: Ticket, b: Ticket) =>
  new Date(b.updatedDateTime).getTime() - new Date(a.updatedDateTime).getTime();

export const listTickets = (): Ticket[] => [...tickets].sort(byUpdatedDesc);
export const listTicketsFor = (requesterId: string): Ticket[] =>
  listTickets().filter((t) => t.requesterId === requesterId);

export function createTicket(input: {
  subject: string;
  description?: string;
  category: string;
  priority: Ticket['priority'];
  requesterId: string;
  requesterName: string;
}): Ticket {
  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: `tk-${randomUUID().slice(0, 8)}`,
    status: 'open',
    createdDateTime: now,
    updatedDateTime: now,
    ...input,
  };
  tickets.unshift(ticket);
  return ticket;
}

export function updateTicket(id: string, patch: Partial<Omit<Ticket, 'id'>>): Ticket | undefined {
  const t = tickets.find((x) => x.id === id);
  if (!t) return undefined;
  Object.assign(t, patch, { updatedDateTime: new Date().toISOString() });
  return { ...t };
}
