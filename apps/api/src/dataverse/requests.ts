import type { ApprovalRequest, RequestStatus, RequestType } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for approval requests — the app's own
 * application user (client-credentials token), so no per-employee Dataverse
 * license is needed to submit a request. Same pattern as dataverse/vault.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly. Type and
 * Status are plain TEXT (not Choice) — the app controls the fixed set of
 * values itself, avoiding Dataverse option-set-value mapping entirely (see
 * data-table/requests.csv for the columns this expects by default).
 *
 * Enabled only when DATAVERSE_REQUEST_TABLE is set; otherwise the app uses
 * the built-in in-memory store so Requests works out of the box.
 */
const TABLE = process.env.DATAVERSE_REQUEST_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_REQUEST_PREFIX || 'flowtech_';
const ID_COL = process.env.DATAVERSE_REQUEST_ID_COL || `${P}requestid`;
const TYPE_COL = process.env.DATAVERSE_REQUEST_TYPE_COL || `${P}type`;
const TITLE_COL = process.env.DATAVERSE_REQUEST_TITLE_COL || `${P}title`;
const DESCRIPTION_COL = process.env.DATAVERSE_REQUEST_DESCRIPTION_COL || `${P}description`;
const STATUS_COL = process.env.DATAVERSE_REQUEST_STATUS_COL || `${P}status`;
const REQUESTERID_COL = process.env.DATAVERSE_REQUEST_REQUESTERID_COL || `${P}requesterid`;
const REQUESTERNAME_COL = process.env.DATAVERSE_REQUEST_REQUESTERNAME_COL || `${P}requestername`;
const APPROVERNAME_COL = process.env.DATAVERSE_REQUEST_APPROVERNAME_COL || `${P}approvername`;
const AMOUNT_COL = process.env.DATAVERSE_REQUEST_AMOUNT_COL || `${P}amount`;
const STARTDATE_COL = process.env.DATAVERSE_REQUEST_STARTDATE_COL || `${P}startdate`;
const ENDDATE_COL = process.env.DATAVERSE_REQUEST_ENDDATE_COL || `${P}enddate`;

export const requestsDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  TYPE_COL,
  TITLE_COL,
  DESCRIPTION_COL,
  STATUS_COL,
  REQUESTERID_COL,
  REQUESTERNAME_COL,
  APPROVERNAME_COL,
  AMOUNT_COL,
  STARTDATE_COL,
  ENDDATE_COL,
].join(',')},createdon,modifiedon`;

const toDto = (r: DvRow): ApprovalRequest => ({
  id: r[ID_COL] as string,
  type: r[TYPE_COL] as RequestType,
  title: (r[TITLE_COL] as string) ?? '',
  description: (r[DESCRIPTION_COL] as string | null) ?? undefined,
  status: (r[STATUS_COL] as RequestStatus) ?? 'pending',
  requesterId: r[REQUESTERID_COL] as string,
  requesterName: (r[REQUESTERNAME_COL] as string) ?? '',
  approverName: (r[APPROVERNAME_COL] as string | null) ?? undefined,
  amount: (r[AMOUNT_COL] as number | null) ?? undefined,
  startDate: (r[STARTDATE_COL] as string | null) ?? undefined,
  endDate: (r[ENDDATE_COL] as string | null) ?? undefined,
  createdDateTime: (r.createdon as string) ?? '',
  updatedDateTime: (r.modifiedon as string) ?? '',
});

export async function dvListRequestsFor(requesterId: string): Promise<ApprovalRequest[]> {
  const url = `/${TABLE}?${SELECT}&$filter=${REQUESTERID_COL} eq '${requesterId}'&$orderby=createdon desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvListPendingApprovals(): Promise<ApprovalRequest[]> {
  const url = `/${TABLE}?${SELECT}&$filter=${STATUS_COL} eq 'pending'&$orderby=createdon desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

/** Admin, team-wide — every request regardless of requester or status. */
export async function dvListAllRequests(): Promise<ApprovalRequest[]> {
  const url = `/${TABLE}?${SELECT}&$orderby=createdon desc`;
  const { data } = await client().get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateRequest(input: {
  type: RequestType;
  title: string;
  description?: string;
  requesterId: string;
  requesterName: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
}): Promise<ApprovalRequest> {
  const row: Record<string, unknown> = {
    [TYPE_COL]: input.type,
    [TITLE_COL]: input.title,
    [DESCRIPTION_COL]: input.description,
    [STATUS_COL]: 'pending',
    [REQUESTERID_COL]: input.requesterId,
    [REQUESTERNAME_COL]: input.requesterName,
    [AMOUNT_COL]: input.amount,
    [STARTDATE_COL]: input.startDate,
    [ENDDATE_COL]: input.endDate,
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

export async function dvSetStatus(id: string, status: RequestStatus, approverName?: string): Promise<ApprovalRequest> {
  const row: Record<string, unknown> = { [STATUS_COL]: status };
  if (approverName) row[APPROVERNAME_COL] = approverName;
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}
