import { randomUUID } from 'node:crypto';
import type { ApprovalRequest, RequestStatus, RequestType } from '@flowtech/shared';
import { mockRequests } from '../mocks.js';

/**
 * Mutable in-memory requests store (dev / mock mode). Seeded from the mocks so
 * the approvals queue has content. Live mode uses Dataverse instead
 * (see dataverse/requests.ts). TODO(prod): this store disappears once Dataverse
 * is wired.
 */
let requests: ApprovalRequest[] = mockRequests.map((r) => ({ ...r }));

const byCreatedDesc = (a: ApprovalRequest, b: ApprovalRequest) =>
  new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime();

export const listRequestsFor = (requesterId: string): ApprovalRequest[] =>
  requests.filter((r) => r.requesterId === requesterId).sort(byCreatedDesc);

export const listAllRequests = (): ApprovalRequest[] => [...requests].sort(byCreatedDesc);

export const listPendingApprovals = (): ApprovalRequest[] =>
  requests.filter((r) => r.status === 'pending').sort(byCreatedDesc);

export const getRequest = (id: string): ApprovalRequest | undefined =>
  requests.find((r) => r.id === id);

export function createRequestRow(input: {
  type: RequestType;
  title: string;
  description?: string;
  requesterId: string;
  requesterName: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
}): ApprovalRequest {
  const now = new Date().toISOString();
  const row: ApprovalRequest = {
    id: `r-${randomUUID().slice(0, 8)}`,
    status: 'pending',
    createdDateTime: now,
    updatedDateTime: now,
    ...input,
  };
  requests.unshift(row);
  return row;
}

export function setRequestStatus(
  id: string,
  status: RequestStatus,
  approverName?: string,
): ApprovalRequest | undefined {
  const row = requests.find((r) => r.id === id);
  if (!row) return undefined;
  row.status = status;
  row.updatedDateTime = new Date().toISOString();
  if (approverName) row.approverName = approverName;
  return { ...row };
}
