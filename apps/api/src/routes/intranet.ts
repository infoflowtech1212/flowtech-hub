/**
 * Intranet feature routes — Projects, Help Desk, Legal, Client Documents, and
 * the Password Vault. Capability-gated, zod-validated, mock-backed (in-memory
 * stores). Mounted under /api by the main api router.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { USE_MOCKS } from '../config.js';
import { requireCapability } from '../auth/middleware.js';
import { mockUser } from '../mocks.js';
import { getMyProfile } from '../graph/me.js';
import { createProject, deleteProject, listProjects, updateProject } from '../store/projects.js';
import { createTicket, listTickets, listTicketsFor, updateTicket } from '../store/tickets.js';
import { createLegal, deleteLegal, listLegal, updateLegal } from '../store/legal.js';
import { createClientDoc, deleteClientDoc, listClientDocs } from '../store/clientDocs.js';
import { createVaultEntry, deleteVaultEntry, listVault, updateVaultEntry } from '../store/vault.js';
import { hasPin, setPin, verifyPin } from '../store/vaultPin.js';
import { pushNotification } from '../store/notifications.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../store/expenses.js';
import { createNote, deleteNote, listNotes, updateNote } from '../store/notes.js';
import { createQuickNote, deleteQuickNote, listQuickNotes, updateQuickNote } from '../store/quickNotes.js';
import { sendVaultFlow } from '../flows/powerAutomate.js';
import { dvCreateVaultRow, dvDeleteVaultRow, dvListVault, dvUpdateVaultRow, vaultDataverseEnabled } from '../dataverse/vault.js';
import { dvHasPin, dvSetPin, dvVerifyPin, vaultPinDataverseEnabled } from '../dataverse/vaultPin.js';
import {
  dvCreateExpense,
  dvDeleteExpense,
  dvListExpenses,
  dvUpdateExpense,
  expenseDataverseEnabled,
} from '../dataverse/expenses.js';
import {
  dvCreateNote,
  dvDeleteNote,
  dvListNotes,
  dvUpdateNote,
  noteDataverseEnabled,
} from '../dataverse/notes.js';
import {
  dvCreateQuickNote,
  dvDeleteQuickNote,
  dvListQuickNotes,
  dvUpdateQuickNote,
  quickNotesDataverseEnabled,
} from '../dataverse/quickNotes.js';
import {
  dvCreateTicket,
  dvListAllTickets,
  dvListTicketsFor,
  dvUpdateTicket,
  ticketDataverseEnabled,
} from '../dataverse/tickets.js';
import {
  dvCreateProject,
  dvDeleteProject,
  dvListProjects,
  dvUpdateProject,
  projectDataverseEnabled,
} from '../dataverse/projects.js';
import type { VaultScope } from '@flowtech/shared';

export const intranetRouter = Router();

/** Resolves the real display name via Graph in live mode — req.auth.userId is just the Entra oid. */
async function who(req: import('express').Request): Promise<{ id: string; name: string }> {
  const auth = req.auth!;
  return { id: auth.userId, name: auth.isMock ? mockUser.displayName : (await getMyProfile(auth)).displayName };
}

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

// Dataverse is the source of truth once DATAVERSE_PROJECT_TABLE is configured
// (live sessions only — mock sessions always use the in-memory store).
const useLocalProjectStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !projectDataverseEnabled();

intranetRouter.get('/projects', requireCapability('projects.view'), async (req, res, next) => {
  try {
    const items = useLocalProjectStore(req) ? listProjects() : await dvListProjects();
    res.json({ items, nextCursor: null, total: items.length });
  } catch (err) {
    next(err);
  }
});
intranetRouter.post('/projects', requireCapability('projects.manage'), async (req, res, next) => {
  const parsed = projectBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const project = useLocalProjectStore(req) ? createProject(parsed.data) : await dvCreateProject(parsed.data);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});
intranetRouter.put('/projects/:id', requireCapability('projects.manage'), async (req, res, next) => {
  const parsed = projectBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const updated = useLocalProjectStore(req)
      ? updateProject(req.params.id, parsed.data)
      : await dvUpdateProject(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Project not found' } });
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Project not found' } });
    }
    next(err);
  }
});
intranetRouter.delete('/projects/:id', requireCapability('projects.manage'), async (req, res, next) => {
  try {
    if (useLocalProjectStore(req)) {
      if (!deleteProject(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
      res.status(204).end();
      return;
    }
    await dvDeleteProject(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Project not found' } });
    }
    next(err);
  }
});

// --- Help Desk -------------------------------------------------------------
const ticketBody = z.object({
  subject: z.string().min(2).max(160),
  description: z.string().max(4000).optional(),
  category: z.string().min(1).max(40),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});

// Dataverse is the source of truth once DATAVERSE_TICKET_TABLE is configured
// (live sessions only — mock sessions always use the in-memory store).
const useLocalTicketStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !ticketDataverseEnabled();

// Agents (helpdesk.manage) see all tickets; everyone else sees their own.
intranetRouter.get('/helpdesk/tickets', requireCapability('helpdesk.view'), async (req, res, next) => {
  try {
    const isAgent = req.auth!.has('helpdesk.manage');
    const userId = req.auth!.userId;
    const items = useLocalTicketStore(req)
      ? isAgent
        ? listTickets()
        : listTicketsFor(userId)
      : isAgent
        ? await dvListAllTickets()
        : await dvListTicketsFor(userId);
    res.json({ items, nextCursor: null, total: items.length });
  } catch (err) {
    next(err);
  }
});
intranetRouter.post('/helpdesk/tickets', requireCapability('helpdesk.view'), async (req, res, next) => {
  const parsed = ticketBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const me = await who(req);
    const ticket = useLocalTicketStore(req)
      ? createTicket({ ...parsed.data, requesterId: me.id, requesterName: me.name })
      : await dvCreateTicket({ ...parsed.data, requesterId: me.id, requesterName: me.name });
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});
intranetRouter.put('/helpdesk/tickets/:id', requireCapability('helpdesk.manage'), async (req, res, next) => {
  const patch = z
    .object({ status: z.enum(['open', 'in-progress', 'resolved', 'closed']).optional(), assignee: z.string().optional() })
    .safeParse(req.body);
  if (!patch.success) return bad(res, patch.error.message);
  try {
    const updated = useLocalTicketStore(req)
      ? updateTicket(req.params.id, patch.data)
      : await dvUpdateTicket(req.params.id, patch.data);
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
  } catch (err) {
    next(err);
  }
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
intranetRouter.post('/client-documents', requireCapability('clientdocs.manage'), async (req, res, next) => {
  const parsed = clientDocBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const me = await who(req);
    res.status(201).json(createClientDoc({ ...parsed.data, uploadedBy: me.name }));
  } catch (err) {
    next(err);
  }
});
intranetRouter.delete('/client-documents/:id', requireCapability('clientdocs.manage'), (req, res) => {
  if (!deleteClientDoc(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Password Vault --------------------------------------------------------
// Dataverse is the source of truth once configured (live sessions only —
// mock sessions always use the in-memory store, same pattern as /attendance).
const vaultScope = (raw: string): VaultScope | null => (raw === 'open' || raw === 'personal' ? raw : null);
const isMockSession = (req: Request) => req.auth?.isMock ?? USE_MOCKS;
const useLocalVaultStore = (req: Request) => isMockSession(req) || !vaultDataverseEnabled();

const vaultBody = z.object({
  title: z.string().min(1).max(120),
  username: z.string().max(200).optional(),
  url: z.string().max(400).optional(),
  notes: z.string().max(2000).optional(),
  category: z.string().max(40).optional(),
  scope: z.enum(['open', 'personal']),
  secret: z.string().max(400).optional(), // write-only; never returned
});
const vaultUpdateBody = z.object({
  title: z.string().min(1).max(120).optional(),
  username: z.string().max(200).optional(),
  url: z.string().max(400).optional(),
  notes: z.string().max(2000).optional(),
  category: z.string().max(40).optional(),
  secret: z.string().max(400).optional(), // only replaces the stored secret when provided
});

intranetRouter.get('/vault/:scope', requireCapability('vault.view'), async (req, res, next) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  try {
    const items = useLocalVaultStore(req)
      ? listVault(scope, req.auth!.userId)
      : await dvListVault(scope, req.auth!.userId);
    res.json({ items, nextCursor: null });
  } catch (err) {
    next(err);
  }
});

intranetRouter.post('/vault', requireCapability('vault.view'), async (req, res, next) => {
  const parsed = vaultBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  // Adding to the shared (open) vault requires the manage capability.
  if (parsed.data.scope === 'open' && !req.auth!.has('vault.manage')) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Managing the shared vault requires vault.manage' } });
  }
  try {
    const me = await who(req);
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
    if (!useLocalVaultStore(req)) {
      // Dataverse is the source of truth: write there and read the response back.
      const entry = await dvCreateVaultRow(payload);
      res.status(201).json(entry);
      return;
    }
    const entry = createVaultEntry({ ...parsed.data, ownerId: me.id, ownerName: me.name });
    if (!isMockSession(req) && !vaultDataverseEnabled()) {
      // No Dataverse table configured: fall back to the Power Automate flow
      // (Dataverse write + notify) so shared-vault notifications still fire.
      await sendVaultFlow({ ...payload, notify: parsed.data.scope === 'open' });
    }
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

intranetRouter.put('/vault/:scope/:id', requireCapability('vault.view'), async (req, res, next) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  if (scope === 'open' && !req.auth!.has('vault.manage')) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Managing the shared vault requires vault.manage' } });
  }
  const parsed = vaultUpdateBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const userId = req.auth!.userId;
  try {
    if (useLocalVaultStore(req)) {
      const entry = updateVaultEntry(req.params.id, scope, userId, parsed.data);
      if (!entry) return res.status(404).json({ error: { code: 'not_found', message: 'Entry not found' } });
      res.json(entry);
      return;
    }
    const entry = await dvUpdateVaultRow(req.params.id, scope, userId, parsed.data);
    res.json(entry);
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found_or_forbidden') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Entry not found' } });
    }
    next(err);
  }
});

intranetRouter.delete('/vault/:scope/:id', requireCapability('vault.view'), async (req, res, next) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  if (scope === 'open' && !req.auth!.has('vault.manage')) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Managing the shared vault requires vault.manage' } });
  }
  const userId = req.auth!.userId;
  try {
    if (useLocalVaultStore(req)) {
      if (!deleteVaultEntry(req.params.id, scope, userId))
        return res.status(404).json({ error: { code: 'not_found', message: 'Entry not found' } });
      res.status(204).end();
      return;
    }
    await dvDeleteVaultRow(req.params.id, scope, userId);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found_or_forbidden') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Entry not found' } });
    }
    next(err);
  }
});

// --- Vault PIN (second security layer, independent per vault) --------------
// Dataverse is the source of truth once configured (live sessions only —
// mock sessions always use the in-memory store, same pattern as /vault).
// Open Vault and Personal Vault each have their own PIN, keyed by scope.
const pinRe = /^\d{4,8}$/;
const pinSetBody = z.object({ pin: z.string().regex(pinRe, 'PIN must be 4–8 digits'), currentPin: z.string().optional() });
const pinVerifyBody = z.object({ pin: z.string().min(1).max(8) });
const useLocalPinStore = (req: Request) => isMockSession(req) || !vaultPinDataverseEnabled();

// Status — is a PIN already set for this user on this vault?
intranetRouter.get('/vault-pin/:scope', requireCapability('vault.view'), async (req, res, next) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  try {
    const userId = req.auth!.userId;
    const isSet = useLocalPinStore(req) ? hasPin(userId, scope) : await dvHasPin(userId, scope);
    res.json({ isSet });
  } catch (err) {
    next(err);
  }
});

// Set or change the PIN for this vault. Changing requires the current PIN.
intranetRouter.post('/vault-pin/:scope', requireCapability('vault.view'), async (req, res, next) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  const parsed = pinSetBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const userId = req.auth!.userId;
  const local = useLocalPinStore(req);
  try {
    const alreadySet = local ? hasPin(userId, scope) : await dvHasPin(userId, scope);
    if (alreadySet) {
      const currentOk = Boolean(
        parsed.data.currentPin &&
          (local
            ? verifyPin(userId, scope, parsed.data.currentPin)
            : await dvVerifyPin(userId, scope, parsed.data.currentPin)),
      );
      if (!currentOk) {
        return res.status(403).json({ error: { code: 'forbidden', message: 'Current PIN is incorrect' } });
      }
    }
    if (local) setPin(userId, scope, parsed.data.pin);
    else await dvSetPin(userId, scope, parsed.data.pin);
    res.json({ ok: true, isSet: true });
  } catch (err) {
    next(err);
  }
});

// Verify the PIN to unlock this vault for this visit.
intranetRouter.post('/vault-pin/:scope/verify', requireCapability('vault.view'), async (req, res, next) => {
  const scope = vaultScope(req.params.scope);
  if (!scope) return bad(res, 'Invalid vault scope');
  const parsed = pinVerifyBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const userId = req.auth!.userId;
    const ok = useLocalPinStore(req)
      ? verifyPin(userId, scope, parsed.data.pin)
      : await dvVerifyPin(userId, scope, parsed.data.pin);
    res.json({ ok });
  } catch (err) {
    next(err);
  }
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

// Dataverse is the source of truth once DATAVERSE_EXPENSE_TABLE is configured
// (live sessions only — mock sessions always use the in-memory store).
const useLocalExpenseStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !expenseDataverseEnabled();

intranetRouter.get('/expenses', requireCapability('expenses.view'), async (req, res, next) => {
  try {
    const items = useLocalExpenseStore(req) ? listExpenses() : await dvListExpenses();
    res.json({ items, nextCursor: null, total: items.length });
  } catch (err) {
    next(err);
  }
});
intranetRouter.post('/expenses', requireCapability('expenses.manage'), async (req, res, next) => {
  const parsed = expenseBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const expense = useLocalExpenseStore(req) ? createExpense(parsed.data) : await dvCreateExpense(parsed.data);
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});
intranetRouter.put('/expenses/:id', requireCapability('expenses.manage'), async (req, res, next) => {
  const parsed = expenseBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const updated = useLocalExpenseStore(req)
      ? updateExpense(req.params.id, parsed.data)
      : await dvUpdateExpense(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Expense not found' } });
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Expense not found' } });
    }
    next(err);
  }
});
intranetRouter.delete('/expenses/:id', requireCapability('expenses.manage'), async (req, res, next) => {
  try {
    if (useLocalExpenseStore(req)) {
      if (!deleteExpense(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
      res.status(204).end();
      return;
    }
    await dvDeleteExpense(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Expense not found' } });
    }
    next(err);
  }
});

// --- Admin notes / ideas board (admins only, via notes.view) ---------------
const noteBody = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(6000),
  pinned: z.boolean().optional(),
});

// Dataverse is the source of truth once DATAVERSE_NOTE_TABLE is configured
// (live sessions only — mock sessions always use the in-memory store).
const useLocalNoteStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !noteDataverseEnabled();

intranetRouter.get('/notes', requireCapability('notes.view'), async (req, res, next) => {
  try {
    const items = useLocalNoteStore(req) ? listNotes() : await dvListNotes();
    res.json({ items, nextCursor: null, total: items.length });
  } catch (err) {
    next(err);
  }
});
intranetRouter.post('/notes', requireCapability('notes.view'), async (req, res, next) => {
  const parsed = noteBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const me = await who(req);
    const note = useLocalNoteStore(req)
      ? createNote({ ...parsed.data, authorId: me.id, authorName: me.name })
      : await dvCreateNote({ ...parsed.data, authorId: me.id, authorName: me.name });
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});
intranetRouter.put('/notes/:id', requireCapability('notes.view'), async (req, res, next) => {
  const parsed = noteBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const updated = useLocalNoteStore(req)
      ? updateNote(req.params.id, parsed.data)
      : await dvUpdateNote(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
    }
    next(err);
  }
});
intranetRouter.delete('/notes/:id', requireCapability('notes.view'), async (req, res, next) => {
  try {
    if (useLocalNoteStore(req)) {
      if (!deleteNote(req.params.id)) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
      res.status(204).end();
      return;
    }
    await dvDeleteNote(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
    }
    next(err);
  }
});

// --- Quick notes (private per-employee; any authenticated user) ------------
const quickNoteColors = ['default', 'yellow', 'green', 'blue', 'pink', 'purple'] as const;
const quickNoteBody = z.object({
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(4000),
  color: z.enum(quickNoteColors).optional(),
});

const useLocalQuickNoteStore = (req: Request) => isMockSession(req) || !quickNotesDataverseEnabled();

intranetRouter.get('/quicknotes', async (req, res, next) => {
  try {
    const ownerId = req.auth!.userId;
    const items = useLocalQuickNoteStore(req) ? listQuickNotes(ownerId) : await dvListQuickNotes(ownerId);
    res.json({ items, nextCursor: null, total: items.length });
  } catch (err) {
    next(err);
  }
});
intranetRouter.post('/quicknotes', async (req, res, next) => {
  const parsed = quickNoteBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const ownerId = req.auth!.userId;
    const note = useLocalQuickNoteStore(req)
      ? createQuickNote(ownerId, parsed.data)
      : await dvCreateQuickNote(ownerId, parsed.data);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});
intranetRouter.put('/quicknotes/:id', async (req, res, next) => {
  const parsed = quickNoteBody.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const ownerId = req.auth!.userId;
  try {
    if (useLocalQuickNoteStore(req)) {
      const updated = updateQuickNote(ownerId, req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
      res.json(updated);
      return;
    }
    res.json(await dvUpdateQuickNote(ownerId, req.params.id, parsed.data));
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found_or_forbidden') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
    }
    next(err);
  }
});
intranetRouter.delete('/quicknotes/:id', async (req, res, next) => {
  const ownerId = req.auth!.userId;
  try {
    if (useLocalQuickNoteStore(req)) {
      if (!deleteQuickNote(ownerId, req.params.id))
        return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
      res.status(204).end();
      return;
    }
    await dvDeleteQuickNote(ownerId, req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found_or_forbidden') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
    }
    next(err);
  }
});
