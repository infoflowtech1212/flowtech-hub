/**
 * Public, unauthenticated intake — a shareable form that anyone (even people
 * outside the tenant) can submit. Each submission creates a help-desk ticket
 * (shown in the ticket center). Dataverse is the source of truth once
 * DATAVERSE_TICKET_TABLE is configured — same table the internal Help Desk
 * routes read/write (routes/intranet.ts) — otherwise it falls back to the
 * in-memory store. Rate-limited.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { USE_MOCKS } from '../config.js';
import { createTicket } from '../store/tickets.js';
import { dvCreateTicket, ticketDataverseEnabled } from '../dataverse/tickets.js';
import { logger } from '../logger.js';

export const publicRouter = Router();

// Tight limit — public endpoint, abuse-prone.
const submitLimiter = rateLimit({ windowMs: 60_000, max: 8, standardHeaders: true, legacyHeaders: false });

const submitBody = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  category: z.string().min(1).max(40).optional().default('General'),
  subject: z.string().min(2).max(160),
  message: z.string().min(1).max(4000),
});

publicRouter.post('/tickets', submitLimiter, async (req, res, next) => {
  const parsed = submitBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const { name, email, category, subject, message } = parsed.data;

  try {
    const ticket =
      USE_MOCKS || !ticketDataverseEnabled()
        ? createTicket({
            subject,
            description: `${message}\n\n— submitted via the public form by ${name} <${email}>`,
            category,
            priority: 'medium',
            requesterId: `public:${email}`,
            requesterName: name,
          })
        : await dvCreateTicket({
            subject,
            description: message,
            category,
            priority: 'medium',
            status: 'open',
            requesterId: `public:${email}`,
            requesterName: name,
            submitterEmail: email,
            source: 'public-form',
          });
    res.status(201).json({ ok: true, reference: ticket.id });
  } catch (err) {
    logger.error({ err }, 'public ticket submission failed');
    next(err);
  }
});
