/**
 * Public, unauthenticated intake — a shareable form that anyone (even people
 * outside the tenant) can submit. Each submission creates a help-desk ticket
 * (shown in the ticket center) and, when the Dataverse ticket table is wired,
 * writes a row there so a flow emails info@flowtechapps.com. Rate-limited.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
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

publicRouter.post('/tickets', submitLimiter, async (req, res) => {
  const parsed = submitBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const { name, email, category, subject, message } = parsed.data;

  // Show it in the ticket center immediately.
  const ticket = createTicket({
    subject,
    description: `${message}\n\n— submitted via the public form by ${name} <${email}>`,
    category,
    priority: 'medium',
    requesterId: `public:${email}`,
    requesterName: name,
  });

  // Persist to Dataverse (triggers the email-to-info@ flow) when configured.
  try {
    if (ticketDataverseEnabled()) {
      await dvCreateTicket({
        subject,
        description: message,
        category,
        priority: 'medium',
        status: 'open',
        requesterName: name,
        submitterEmail: email,
        source: 'public-form',
      });
    }
  } catch (err) {
    logger.error({ err }, 'public ticket: Dataverse write failed');
    // Don't fail the submission — the ticket is already in the center.
  }

  res.status(201).json({ ok: true, reference: ticket.id });
});
