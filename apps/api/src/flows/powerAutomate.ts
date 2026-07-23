import axios from 'axios';
import { config, USE_MOCKS } from '../config.js';
import { logger } from '../logger.js';

/**
 * Thin wrappers over the two HTTP-triggered Power Automate flows. Trigger URLs
 * are server-side only (never sent to the browser). In mock mode (or when a URL
 * isn't configured) these no-op and just log, so the request lifecycle is fully
 * demoable without the flows wired.
 */

export interface ApprovalFlowPayload {
  requestId: string;
  type: string;
  title: string;
  requesterName: string;
  approverName?: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
  /** Where the flow calls back with the outcome. */
  callbackUrl: string;
  callbackSecret: string;
}

export async function startApprovalFlow(payload: ApprovalFlowPayload): Promise<boolean> {
  if (USE_MOCKS || !config.flows.approvalUrl) {
    logger.info({ requestId: payload.requestId }, 'approval flow (mock/no-op) — would route to approver');
    return false;
  }
  try {
    await axios.post(config.flows.approvalUrl, payload, { timeout: 10_000 });
    return true;
  } catch (err) {
    logger.error({ err, requestId: payload.requestId }, 'approval flow trigger failed');
    return false;
  }
}

export interface VaultFlowPayload {
  scope: 'open' | 'personal';
  /** True for shared (open) entries → the flow notifies all employees. */
  notify: boolean;
  title: string;
  username?: string;
  url?: string;
  notes?: string;
  category?: string;
  /** The secret to persist. Store it ENCRYPTED in Dataverse (or in Key Vault). */
  secret?: string;
  addedById: string;
  addedByName: string;
}

/**
 * Send a vault entry to the Power Automate flow, which writes it to Dataverse
 * and — for shared (open) entries — notifies all employees. No-op in mock mode
 * or when the flow URL isn't configured.
 */
export async function sendVaultFlow(payload: VaultFlowPayload): Promise<boolean> {
  if (USE_MOCKS || !config.flows.vaultUrl) {
    logger.info(
      { scope: payload.scope, notify: payload.notify, title: payload.title },
      'vault flow (mock/no-op) — would save to Dataverse' + (payload.notify ? ' + notify all' : ''),
    );
    return false;
  }
  try {
    await axios.post(config.flows.vaultUrl, payload, { timeout: 10_000 });
    return true;
  } catch (err) {
    logger.error({ err, title: payload.title }, 'vault flow trigger failed');
    return false;
  }
}

export interface NotifyPayload {
  title: string;
  body: string;
  audience?: string;
}

export async function sendNotifyFlow(payload: NotifyPayload): Promise<boolean> {
  if (USE_MOCKS || !config.flows.notifyUrl) {
    logger.info({ title: payload.title }, 'notify flow (mock/no-op)');
    return false;
  }
  try {
    await axios.post(config.flows.notifyUrl, payload, { timeout: 10_000 });
    return true;
  } catch (err) {
    logger.error({ err }, 'notify flow trigger failed');
    return false;
  }
}
