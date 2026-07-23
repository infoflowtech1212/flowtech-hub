import type { ApprovalRequest, RequestStatus, RequestType } from '@flowtech/shared';
import type { AuthContext } from '../auth/middleware.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for approval requests. Assumes a custom table
 * `flowtech_request` with the columns mapped below. Adjust the logical names to
 * match your solution's publisher prefix.
 *
 * TODO(tenant): confirm the table + column logical names during Dataverse setup
 * (see SETUP.md §3). The status option-set values (1..5) must match the table's
 * choice column.
 */
const TABLE = 'flowtech_requests'; // entity set (pluralized logical name)

const STATUS_TO_CODE: Record<RequestStatus, number> = {
  draft: 1,
  pending: 2,
  approved: 3,
  rejected: 4,
  cancelled: 5,
};
const CODE_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_TO_CODE).map(([k, v]) => [v, k]),
) as Record<number, RequestStatus>;

interface DvRow {
  flowtech_requestid: string;
  flowtech_type: RequestType;
  flowtech_title: string;
  flowtech_description?: string;
  flowtech_status: number;
  flowtech_requesterid: string;
  flowtech_requestername: string;
  flowtech_approvername?: string;
  flowtech_amount?: number;
  flowtech_startdate?: string;
  flowtech_enddate?: string;
  createdon: string;
  modifiedon: string;
}

const toDto = (r: DvRow): ApprovalRequest => ({
  id: r.flowtech_requestid,
  type: r.flowtech_type,
  title: r.flowtech_title,
  description: r.flowtech_description,
  status: CODE_TO_STATUS[r.flowtech_status] ?? 'pending',
  requesterId: r.flowtech_requesterid,
  requesterName: r.flowtech_requestername,
  approverName: r.flowtech_approvername,
  amount: r.flowtech_amount,
  startDate: r.flowtech_startdate,
  endDate: r.flowtech_enddate,
  createdDateTime: r.createdon,
  updatedDateTime: r.modifiedon,
});

const SELECT =
  '$select=flowtech_requestid,flowtech_type,flowtech_title,flowtech_description,flowtech_status,flowtech_requesterid,flowtech_requestername,flowtech_approvername,flowtech_amount,flowtech_startdate,flowtech_enddate,createdon,modifiedon';

export async function dvListRequestsFor(auth: AuthContext, requesterId: string): Promise<ApprovalRequest[]> {
  const client = dataverseClientFor(auth.getDataverseToken);
  const url = `/${TABLE}?${SELECT}&$filter=flowtech_requesterid eq '${requesterId}'&$orderby=createdon desc`;
  const { data } = await client.get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvListPendingApprovals(auth: AuthContext): Promise<ApprovalRequest[]> {
  const client = dataverseClientFor(auth.getDataverseToken);
  const url = `/${TABLE}?${SELECT}&$filter=flowtech_status eq ${STATUS_TO_CODE.pending}&$orderby=createdon desc`;
  const { data } = await client.get(url);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateRequest(
  auth: AuthContext,
  input: {
    type: RequestType;
    title: string;
    description?: string;
    requesterId: string;
    requesterName: string;
    amount?: number;
    startDate?: string;
    endDate?: string;
  },
): Promise<ApprovalRequest> {
  const client = dataverseClientFor(auth.getDataverseToken);
  const body = {
    flowtech_type: input.type,
    flowtech_title: input.title,
    flowtech_description: input.description,
    flowtech_status: STATUS_TO_CODE.pending,
    flowtech_requesterid: input.requesterId,
    flowtech_requestername: input.requesterName,
    flowtech_amount: input.amount,
    flowtech_startdate: input.startDate,
    flowtech_enddate: input.endDate,
  };
  const { data } = await client.post(`/${TABLE}`, body);
  return toDto(data as DvRow);
}

export async function dvSetStatus(
  auth: AuthContext,
  id: string,
  status: RequestStatus,
  approverName?: string,
): Promise<ApprovalRequest> {
  const client = dataverseClientFor(auth.getDataverseToken);
  const body: Record<string, unknown> = { flowtech_status: STATUS_TO_CODE[status] };
  if (approverName) body.flowtech_approvername = approverName;
  const { data } = await client.patch(`/${TABLE}(${id})`, body);
  return toDto(data as DvRow);
}
