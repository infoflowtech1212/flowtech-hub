import type { Ticket, TicketPriority, TicketStatus } from '@flowtech/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for Help Desk tickets — the app's own
 * application user (client-credentials token), so no per-employee Dataverse
 * license is needed, and the public (unauthenticated) submit form can write
 * too. Dataverse is the source of truth (list/create/update) when configured;
 * the in-memory store (store/tickets.ts) is only used in mock mode or before
 * the table is wired up. Same pattern as dataverse/vault.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/tickets.csv for a ready-to-import template).
 */
// Defaults below match the live `ft_supporttickets` table (Power Platform
// admin center → FlowTech - L+M Asset Transitions → Tables → Support Ticket → Columns).
const TABLE = process.env.DATAVERSE_TICKET_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_TICKET_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_TICKET_ID_COL || `${P}supportticketid`;
const SUBJECT_COL = process.env.DATAVERSE_TICKET_SUBJECT_COL || `${P}ticketsubject`;
const DESCRIPTION_COL = process.env.DATAVERSE_TICKET_DESCRIPTION_COL || `${P}ticketdescription`;
const CATEGORY_COL = process.env.DATAVERSE_TICKET_CATEGORY_COL || `${P}issuecategory`;
const PRIORITY_COL = process.env.DATAVERSE_TICKET_PRIORITY_COL || `${P}prioritylevel`;
const STATUS_COL = process.env.DATAVERSE_TICKET_STATUS_COL || `${P}ticketstatus`;
const REQUESTERID_COL = process.env.DATAVERSE_TICKET_REQUESTERID_COL || `${P}requesteridentifier`;
const REQUESTERNAME_COL = process.env.DATAVERSE_TICKET_REQUESTERNAME_COL || `${P}requestername`;
const ASSIGNEE_COL = process.env.DATAVERSE_TICKET_ASSIGNEE_COL || `${P}assigned`;
const SUBMITTEREMAIL_COL = process.env.DATAVERSE_TICKET_SUBMITTEREMAIL_COL || `${P}submitteremail`;
const SOURCE_COL = process.env.DATAVERSE_TICKET_SOURCE_COL || `${P}ticketsource`;

export const ticketDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  SUBJECT_COL,
  DESCRIPTION_COL,
  CATEGORY_COL,
  PRIORITY_COL,
  STATUS_COL,
  REQUESTERID_COL,
  REQUESTERNAME_COL,
  ASSIGNEE_COL,
].join(',')},createdon,modifiedon`;

const toDto = (r: DvRow): Ticket => ({
  id: r[ID_COL] as string,
  subject: (r[SUBJECT_COL] as string) ?? '',
  description: (r[DESCRIPTION_COL] as string | null) ?? undefined,
  category: (r[CATEGORY_COL] as string) ?? '',
  priority: ((r[PRIORITY_COL] as TicketPriority | null) ?? 'medium') as TicketPriority,
  status: ((r[STATUS_COL] as TicketStatus | null) ?? 'open') as TicketStatus,
  requesterId: (r[REQUESTERID_COL] as string) ?? '',
  requesterName: (r[REQUESTERNAME_COL] as string) ?? '',
  assignee: (r[ASSIGNEE_COL] as string | null) ?? undefined,
  createdDateTime: (r.createdon as string) ?? '',
  updatedDateTime: (r.modifiedon as string) ?? (r.createdon as string) ?? '',
});

/** Agent view — every ticket regardless of requester. */
export async function dvListAllTickets(): Promise<Ticket[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}&$orderby=modifiedon desc`);
  return (data.value as DvRow[]).map(toDto);
}

/** Requester view — only their own tickets. */
export async function dvListTicketsFor(requesterId: string): Promise<Ticket[]> {
  const url = `/${TABLE}?${SELECT}&$filter=${REQUESTERID_COL} eq '${requesterId}'&$orderby=modifiedon desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateTicket(input: {
  subject: string;
  description?: string;
  category: string;
  priority: TicketPriority;
  status?: TicketStatus;
  requesterId: string;
  requesterName: string;
  submitterEmail?: string;
  source?: string;
}): Promise<Ticket> {
  const row: Record<string, unknown> = {
    [SUBJECT_COL]: input.subject,
    [DESCRIPTION_COL]: input.description,
    [CATEGORY_COL]: input.category,
    [PRIORITY_COL]: input.priority,
    [STATUS_COL]: input.status ?? 'open',
    [REQUESTERID_COL]: input.requesterId,
    [REQUESTERNAME_COL]: input.requesterName,
    [SUBMITTEREMAIL_COL]: input.submitterEmail,
    [SOURCE_COL]: input.source ?? 'internal',
  };
  const { data } = await client().post(`/${TABLE}`, row);
  logger.info({ subject: input.subject, source: input.source ?? 'internal' }, 'ticket written to Dataverse');
  return toDto(data as DvRow);
}

export async function dvUpdateTicket(
  id: string,
  patch: { status?: TicketStatus; assignee?: string },
): Promise<Ticket> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row[STATUS_COL] = patch.status;
  if (patch.assignee !== undefined) row[ASSIGNEE_COL] = patch.assignee;
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}
