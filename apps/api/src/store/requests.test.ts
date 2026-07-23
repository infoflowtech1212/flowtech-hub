import { describe, expect, it } from 'vitest';
import {
  createRequestRow,
  listPendingApprovals,
  listRequestsFor,
  setRequestStatus,
} from './requests.js';

describe('requests store (mock persistence)', () => {
  it('creates a pending request owned by the requester', () => {
    const row = createRequestRow({
      type: 'leave',
      title: 'Test leave',
      requesterId: 'user-x',
      requesterName: 'User X',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
    });
    expect(row.status).toBe('pending');
    expect(listRequestsFor('user-x').some((r) => r.id === row.id)).toBe(true);
    expect(listPendingApprovals().some((r) => r.id === row.id)).toBe(true);
  });

  it('approving moves a request out of the pending queue and records the approver', () => {
    const row = createRequestRow({
      type: 'expense',
      title: 'Test expense',
      requesterId: 'user-y',
      requesterName: 'User Y',
      amount: 100,
    });
    const updated = setRequestStatus(row.id, 'approved', 'Manager M');
    expect(updated?.status).toBe('approved');
    expect(updated?.approverName).toBe('Manager M');
    expect(listPendingApprovals().some((r) => r.id === row.id)).toBe(false);
  });

  it('returns undefined when updating a missing request', () => {
    expect(setRequestStatus('does-not-exist', 'approved')).toBeUndefined();
  });
});
