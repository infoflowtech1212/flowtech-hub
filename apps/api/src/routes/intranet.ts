/**
 * Intranet feature routes — Projects, Help Desk, Legal, Client Documents, and
 * the Password Vault. Capability-gated, zod-validated, mock-backed (in-memory
 * stores). Mounted under /api by the main api router.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireCapability } from '../auth/middleware.js';
import { mockUser } from '../mocks.js';
import { createProject, deleteProject, listProjects, updateProject } from '../store/projects.js';
import { createTicket, listTickets, listTicketsFor, updateTicket } from '../store/tickets.js';
import { createLegal, deleteLegal, listLegal, updateLegal } from '../store/legal.js';
import { createClientDoc, deleteClientDoc, listClientDocs } from '../store/clientDocs.js';
import { createVaultEntry, deleteVaultEntry, listVault } from '../store/vault.js';
import { hasPin, setPin, verifyPin } from '../store/vaultPin.js';
import { pushNotification } from '../store/notifications.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../store/expenses.js';
import { createNote, deleteNote, listNotes, updateNote } from '../store/notes.js';
import { createQuickNote, deleteQuickNote, listQuickNotes, updateQuickNote } from '../store/quickNotes.js';
import { sendVaultFlow } from '../flows/powerAutomate.js';
import { dvCreateVaultRow, vaultDataverseEnabled } from '../dataverse/vault.js';
import { dvCreateExpense, expenseDataverseEnabled } from '../dataverse/expenses.js';
import { dvCreateNote, noteDataverseEnabled } from '../dataverse/notes.js';
import { logger } from '../logger.js';
import type { VaultScope } from '@flowtech/shared';

export const intranetRouter = Router();

const who = (req: import('express').Request) => ({
  id: req.auth!.userId,
  name: req.auth!.isMock ? mockUser.displayName : req.auth!.userId,
});

const bad = (res: import('express').Response, message: string) =>
  res.status(400).json({ error: { code: 'bad_request', message } });

// --- Projects --------------------------------------------------------------
const projectBody = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  status: z.enum(['planning', 'active', 'on-hold', 'completed']),
  owner: z.string().min(1).max(120),
  progress: z.number().min(0).max(100),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

intranetRouter.get('/projects', requireCapability('projects.view'), (_req, res) => {
  const items = listProjects();
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/projects', requireCapability('projects.manage'), (req, res) => {
  const parsed = projectBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  res.status(201).json(createProject(parsed.data));
});
intranetRouter.put('/projects/:id', requireCapability('projects.manage'), (req, res) => {
  const parsed = projectBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const updated = updateProject(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Project not found' } });
  res.json(updated);
});
intranetRouter.delete('/projects/:id', requireCapability('projects.manage'), (req, res) => {
  if (!deleteProject(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Help Desk -------------------------------------------------------------
const ticketBody = z.object({
  subject: z.string().min(2).max(160),
  description: z.string().max(4000).optional(),
  category: z.string().min(1).max(40),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});

// Agents (helpdesk.manage) see all tickets; everyone else sees their own.
intranetRouter.get('/helpdesk/tickets', requireCapability('helpdesk.view'), (req, res) => {
  const items = req.auth!.has('helpdesk.manage') ? listTickets() : listTicketsFor(req.auth!.userId);
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/helpdesk/tickets', requireCapability('helpdesk.view'), (req, res) => {
  const parsed = ticketBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const me = who(req);
  res.status(201).json(createTicket({ ...parsed.data, requesterId: me.id, requesterName: me.name }));
});
intranetRouter.put('/helpdesk/tickets/:id', requireCapability('helpdesk.manage'), (req, res) => {
  const patch = z
    .object({ status: z.enum(['open', 'in-progress', 'resolved', 'closed']).optional(), assignee: z.string().optional() })
    .safeParse(req.body);
  if (!patch.success) return bad(res, patch.error.message);
  const updated = updateTicket(req.params.id, patch.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Ticket not found' } });
  // Notify the ticket's requester when the status changes (internal tickets only).
  if (patch.data.status && !updated.requesterId.startsWith('public:')) {
    pushNotification(updated.requesterId, {
      title: `Ticket ${patch.data.status}`,
      body: `"${updated.subject}" is now ${patch.data.status}.`,
      kind: 'system',
      link: '/helpdesk',
    });
  }
  res.json(updated);
});

// --- Legal -----------------------------------------------------------------
const legalBody = z.object({
  title: z.string().min(2).max(160),
  type: z.enum(['contract', 'nda', 'policy', 'agreement', 'other']),
  status: z.enum(['draft', 'in-review', 'signed', 'expired']),
  counterparty: z.string().max(120).optional(),
  owner: z.string().min(1).max(120),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
});

intranetRouter.get('/legal', requireCapability('legal.view'), (_req, res) => {
  const items = listLegal();
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/legal', requireCapability('legal.manage'), (req, res) => {
  const parsed = legalBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  res.status(201).json(createLegal(parsed.data));
});
intranetRouter.put('/legal/:id', requireCapability('legal.manage'), (req, res) => {
  const parsed = legalBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const updated = updateLegal(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.json(updated);
});
intranetRouter.delete('/legal/:id', requireCapability('legal.manage'), (req, res) => {
  if (!deleteLegal(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Client Documents ------------------------------------------------------
const clientDocBody = z.object({
  name: z.string().min(1).max(200),
  client: z.string().min(1).max(120),
  category: z.string().max(40).optional(),
  size: z.number().optional(),
  url: z.string().url().optional(),
});

intranetRouter.get('/client-documents', requireCapability('clientdocs.view'), (_req, res) => {
  const items = listClientDocs();
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/client-documents', requireCapability('clientdocs.manage'), (req, res) => {
  const parsed = clientDocBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  res.status(201).json(createClientDoc({ ...parsed.data, uploadedBy: who(req).name }));
});
intranetRouter.delete('/client-documents/:id', requireCapability('clientdocs.manage'), (req, res) => {
  if (!deleteClientDoc(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Password Vault --------------------------------------------------------
const vaultScope = (raw: string): VaultScope | null => (raw === 'open' || raw === 'personal' ? raw : null);

const vaultBody = z.object({
  title: z.string().min(1).max(120),
  username: z.string().max(200).optional(),
  url: z.string().max(400).optional(),
  notes: z.string().max(2000).optional(),
  category: z.string().max(40).optional(),
  scope: z.enum(['open', 'personal']),
  secret: z.string().max(400).optional(), // write-only; never returned
});

intranetRouter.get('/vault/:scope', requireCapability('vault.view'), (req, res) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  res.json({ items: listVault(scope, req.auth!.userId), nextCursor: null });
});

intranetRouter.post('/vault', requireCapability('vault.view'), async (req, res, next) => {
  const parsed = vaultBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  // Adding to the shared (open) vault requires the manage capability.
  if (parsed.data.scope === 'open' && !req.auth!.has('vault.manage')) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Managing the shared vault requires vault.manage' } });
  }
  const me = who(req);
  const entry = createVaultEntry({ ...parsed.data, ownerId: me.id, ownerName: me.name });

  const payload = {
    scope: parsed.data.scope,
    title: parsed.data.title,
    username: parsed.data.username,
    url: parsed.data.url,
    notes: parsed.data.notes,
    category: parsed.data.category,
    secret: parsed.data.secret,
    addedById: me.id,
    addedByName: me.name,
  };

  try {
    if (vaultDataverseEnabled()) {
      // Write straight to Dataverse (as the app's application user). A
      // Dataverse-triggered flow notifies all employees for shared entries.
      await dvCreateVaultRow(payload);
    } else {
      // Fallback: Power Automate HTTP flow (Dataverse write + notify).
      await sendVaultFlow({ ...payload, notify: parsed.data.scope === 'open' });
    }
  } catch (err) {
    return next(err);
  }
  res.status(201).json(entry);
});

intranetRouter.delete('/vault/:scope/:id', requireCapability('vault.view'), (req, res) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  if (scope === 'open' && !req.auth!.has('vault.manage')) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Managing the shared vault requires vault.manage' } });
  }
  if (!deleteVaultEntry(req.params.id, scope, req.auth!.userId))
    return res.status(404).json({ error: { code: 'not_found', message: 'Entry not found' } });
  res.status(204).end();
});

// --- Vault PIN (second security layer over both vaults) --------------------
const pinRe = /^\d{4,8}$/;
const pinSetBody = z.object({ pin: z.string().regex(pinRe, 'PIN must be 4–8 digits'), currentPin: z.string().optional() });
const pinVerifyBody = z.object({ pin: z.string().min(1).max(8) });

// Status — is a PIN already set for this user?
intranetRouter.get('/vault-pin', requireCapability('vault.view'), (req, res) => {
  res.json({ isSet: hasPin(req.auth!.userId) });
});

// Set or change the PIN. Changing requires the current PIN.
intranetRouter.post('/vault-pin', requireCapability('vault.view'), (req, res) => {
  const parsed = pinSetBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const userId = req.auth!.userId;
  if (hasPin(userId)) {
    if (!parsed.data.currentPin || !verifyPin(userId, parsed.data.currentPin)) {
      return res.status(403).json({ error: { code: 'forbidden', message: 'Current PIN is incorrect' } });
    }
  }
  setPin(userId, parsed.data.pin);
  res.json({ ok: true, isSet: true });
});

// Verify the PIN to unlock the vault for this visit.
intranetRouter.post('/vault-pin/verify', requireCapability('vault.view'), (req, res) => {
  const parsed = pinVerifyBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  res.json({ ok: verifyPin(req.auth!.userId, parsed.data.pin) });
});

// --- Expense tracker -------------------------------------------------------
const expenseBody = z.object({
  item: z.string().min(1).max(160),
  category: z.enum(['software', 'subscription', 'hardware', 'resource', 'service', 'other']),
  vendor: z.string().max(120).optional(),
  amount: z.number().min(0).max(1e9),
  currency: z.string().min(1).max(8).default('USD'),
  recurrence: z.enum(['one-time', 'monthly', 'quarterly', 'yearly']),
  status: z.enum(['active', 'pending', 'cancelled']).default('active'),
  owner: z.string().max(120).optional(),
  renewalDate: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

intranetRouter.get('/expenses', requireCapability('expenses.view'), (_req, res) => {
  const items = listExpenses();
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/expenses', requireCapability('expenses.manage'), async (req, res) => {
  const parsed = expenseBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const expense = createExpense(parsed.data);
  // Text data → Dataverse (best-effort; never blocks the in-app tracker).
  try {
    if (expenseDataverseEnabled()) await dvCreateExpense(parsed.data);
  } catch (err) {
    logger.error({ err }, 'expense: Dataverse write failed');
  }
  res.status(201).json(expense);
});
intranetRouter.put('/expenses/:id', requireCapability('expenses.manage'), (req, res) => {
  const parsed = expenseBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const updated = updateExpense(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Expense not found' } });
  res.json(updated);
});
intranetRouter.delete('/expenses/:id', requireCapability('expenses.manage'), (req, res) => {
  if (!deleteExpense(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Admin notes / ideas board (admins only, via notes.view) ---------------
const noteBody = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(6000),
  pinned: z.boolean().optional(),
});

intranetRouter.get('/notes', requireCapability('notes.view'), (_req, res) => {
  const items = listNotes();
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/notes', requireCapability('notes.view'), async (req, res) => {
  const parsed = noteBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const me = who(req);
  const note = createNote({ ...parsed.data, authorId: me.id, authorName: me.name });
  try {
    if (noteDataverseEnabled()) await dvCreateNote({ title: note.title, body: note.body, authorName: note.authorName });
  } catch (err) {
    logger.error({ err }, 'admin note: Dataverse write failed');
  }
  res.status(201).json(note);
});
intranetRouter.put('/notes/:id', requireCapability('notes.view'), (req, res) => {
  const parsed = noteBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const updated = updateNote(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
  res.json(updated);
});
intranetRouter.delete('/notes/:id', requireCapability('notes.view'), (req, res) => {
  if (!deleteNote(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Quick notes (private per-employee; any authenticated user) ------------
const quickNoteColors = ['default', 'yellow', 'green', 'blue', 'pink', 'purple'] as const;
const quickNoteBody = z.object({
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(4000),
  color: z.enum(quickNoteColors).optional(),
});

intranetRouter.get('/quicknotes', (req, res) => {
  const items = listQuickNotes(req.auth!.userId);
  res.json({ items, nextCursor: null, total: items.length });
});
intranetRouter.post('/quicknotes', (req, res) => {
  const parsed = quickNoteBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  res.status(201).json(createQuickNote(req.auth!.userId, parsed.data));
});
intranetRouter.put('/quicknotes/:id', (req, res) => {
  const parsed = quickNoteBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const updated = updateQuickNote(req.auth!.userId, req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
  res.json(updated);
});
intranetRouter.delete('/quicknotes/:id', (req, res) => {
  if (!deleteQuickNote(req.auth!.userId, req.params.id))
    return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});
