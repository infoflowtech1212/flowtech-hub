/**
 * Callback surface for Power Automate. Mounted OUTSIDE the /api session gate
 * (the flow has no user session), so it's authenticated by a shared secret in
 * the `x-flow-secret` header. In mock mode it updates the in-memory store so the
 * approval lifecycle is demoable end-to-end.
 */
import { Router } from 'express';
import { z } from 'zod';
import { config, USE_MOCKS } from '../config.js';
import { logger } from '../logger.js';
import { getRequest, setRequestStatus } from '../store/requests.js';
import { pushNotification } from '../store/notifications.js';
import { sendNotifyFlow } from './powerAutomate.js';

export const flowsRouter = Router();

const callbackBody = z.object({
  requestId: z.string(),
  decision: z.enum(['approved', 'rejected']),
  approverName: z.string().optional(),
  comment: z.string().optional(),
});

flowsRouter.post('/approval-callback', async (req, res) => {
  // Constant-work secret check.
  const secret = req.get('x-flow-secret') ?? '';
  if (!config.flows.callbackSecret || secret !== config.flows.callbackSecret) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid flow secret' } });
  }

  const parsed = callbackBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const { requestId, decision, approverName } = parsed.data;

  // Live mode persists to Dataverse via a service-principal path; for now the
  // in-memory store is updated in mock/dev. TODO(prod): dvSetStatus with an app token.
  const updated = setRequestStatus(requestId, decision, approverName);
  if (!updated && USE_MOCKS) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Request not found' } });
  }

  const req0 = updated ?? getRequest(requestId);
  logger.info({ requestId, decision }, 'approval outcome received from flow');

  // In-app notification for the requester.
  if (req0?.requesterId) {
    pushNotification(req0.requesterId, {
      title: `Request ${decision}`,
      body: `Your request "${req0.title}" was ${decision}.`,
      kind: 'approval',
      link: '/requests',
    });
  }

  // Notify the requester of the outcome (external channel).
  await sendNotifyFlow({
    title: `Request ${decision}`,
    body: `Your request "${req0?.title ?? requestId}" was ${decision}.`,
    audience: req0?.requesterId,
  });

  res.json({ ok: true, status: decision });
});
