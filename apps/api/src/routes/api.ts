/**
 * Typed REST surface the React SPA talks to. In Build Order step 1 every
 * handler returns mock data (see mocks.ts). Later steps swap the mock bodies
 * for real Microsoft Graph / Dataverse / SharePoint reads behind the same
 * response shapes — the client never changes.
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import axios from 'axios';
import { z } from 'zod';
import type { DirectoryPerson, OrgChart } from '@flowtech/shared';
import { getProfileSupplement, setProfileSupplement } from '../store/profiles.js';
import { config, USE_MOCKS } from '../config.js';
import { getMyPhoto, getMyProfile } from '../graph/me.js';
import { getOrgPeople, getPersonChart, getPersonPhoto, listPeople } from '../graph/directory.js';
import { computeCelebrations, getCelebrations } from '../graph/celebrations.js';
import {
  createShareLink,
  downloadFile,
  ensureConnection,
  isFixedLibrary,
  listChildren,
  listLibraries,
  listSites,
  searchDocuments,
  setConnection,
  uploadFile,
} from '../graph/sharepoint.js';
import { createEvent, getEvents } from '../graph/calendar.js';
import { ReauthRequiredError } from '../auth/tokens.js';
import { roleNamesFor } from '../auth/permissions.js';
import { requireCapability } from '../auth/middleware.js';
import { adminRouter } from './admin.js';
import { intranetRouter } from './intranet.js';
import { listAnnouncements, listQuickLinks } from '../store/content.js';
import {
  createRequestRow,
  listPendingApprovals,
  listRequestsFor,
  setRequestStatus,
} from '../store/requests.js';
import {
  dvCreateRequest,
  dvListPendingApprovals,
  dvListRequestsFor,
  dvSetStatus,
  requestsDataverseEnabled,
} from '../dataverse/requests.js';
import { sendNotifyFlow, startApprovalFlow } from '../flows/powerAutomate.js';
import { listNotifications, markAllRead, markRead, pushBroadcast, pushNotification, unreadCount } from '../store/notifications.js';
import { createAsset, deleteAsset, listAssets, updateAsset } from '../store/assets.js';
import { createHoliday, deleteHoliday, listHolidays } from '../store/holidays.js';
import { createCompanyEvent, deleteCompanyEvent, listCompanyEvents } from '../store/events.js';
import {
  mockCelebrationRecords,
  mockDirectory,
  mockDocuments,
  mockRangeEvents,
  mockTodayEvents,
  mockUser,
} from '../mocks.js';

export const apiRouter = Router();

// Small helper: mark responses so the client/devtools can see mock mode.
apiRouter.use((_req, res, next) => {
  res.setHeader('X-FlowTech-Data', USE_MOCKS ? 'mock' : 'live');
  next();
});

/** Wrap an async handler so a stale-token error maps to 401 and the rest to the
 *  central error handler. Keeps live route bodies terse. */
const live =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign-in required' } });
        return;
      }
      // Surface Microsoft Graph client errors (validation/permission) so the UI
      // shows the real reason instead of a generic 500.
      const gerr = err as { statusCode?: number; code?: string; message?: string };
      if (typeof gerr?.statusCode === 'number' && gerr.statusCode >= 400 && gerr.statusCode < 500) {
        res
          .status(gerr.statusCode)
          .json({ error: { code: gerr.code ?? 'graph_error', message: gerr.message ?? 'Request rejected' } });
        return;
      }
      next(err);
    }
  };

const isMock = (req: Request) => req.auth?.isMock ?? USE_MOCKS;
// Use the built-in in-memory request store unless a Dataverse requests table is
// configured (DATAVERSE_REQUEST_TABLE). Keeps Approvals working out of the box.
const useRequestStore = (req: Request) => isMock(req) || !requestsDataverseEnabled();

// --- Identity --------------------------------------------------------------
apiRouter.get('/me', async (req, res, next) => {
  const auth = req.auth!;
  const roles = roleNamesFor(auth.roleIds);
  if (auth.isMock) {
    return res.json({ ...mockUser, roles, capabilities: auth.capabilities });
  }
  try {
    const profile = await getMyProfile(auth);
    res.json({ ...profile, roles, capabilities: auth.capabilities });
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      return res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign-in required' } });
    }
    next(err);
  }
});

// Self-service profile supplement — the signed-in user completes their own
// LinkedIn / working hours / bio / DOB / joining date (feeds their Org card).
apiRouter.get('/me/profile', (req, res) => {
  res.json(getProfileSupplement(req.auth!.userId));
});

const meProfileBody = z.object({
  linkedIn: z.string().max(300).optional(),
  workingHours: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  birthday: z.string().max(40).optional(),
  hireDate: z.string().max(40).optional(),
});

apiRouter.put('/me/profile', (req, res) => {
  const parsed = meProfileBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  res.json(setProfileSupplement(req.auth!.userId, parsed.data));
});

// BFF photo proxy — the browser never sees a raw Graph URL or token.
apiRouter.get('/me/photo', async (req, res, next) => {
  if (req.auth?.isMock ?? USE_MOCKS) return res.status(404).end();
  try {
    const photo = await getMyPhoto(req.auth!);
    if (!photo) return res.status(404).end();
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(photo.buffer);
  } catch (err) {
    if (err instanceof ReauthRequiredError) return res.status(401).end();
    next(err);
  }
});

// --- Directory -------------------------------------------------------------
apiRouter.get(
  '/directory',
  requireCapability('directory.view'),
  live(async (req, res) => {
    const q = String(req.query.q ?? '');
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    if (isMock(req)) {
      const ql = q.toLowerCase();
      const people = ql
        ? mockDirectory.filter((p) =>
            [p.displayName, p.jobTitle, p.department, p.mail]
              .filter(Boolean)
              .some((f) => f!.toLowerCase().includes(ql)),
          )
        : mockDirectory;
      res.json({ items: people, nextCursor: null, total: people.length });
      return;
    }
    res.json(await listPeople(req.auth!, q, cursor));
  }),
);

// Upcoming celebrations (birthdays + work anniversaries) — must precede /directory/:id.
apiRouter.get(
  '/celebrations',
  requireCapability('directory.view'),
  live(async (req, res) => {
    if (isMock(req)) {
      res.json(computeCelebrations(mockCelebrationRecords()));
      return;
    }
    res.json(await getCelebrations(req.auth!));
  }),
);

// Full org (all people with managerId) — must precede /directory/:id.
apiRouter.get(
  '/directory/org',
  requireCapability('directory.view'),
  live(async (req, res) => {
    if (isMock(req)) {
      res.json({ items: mockDirectory, nextCursor: null, total: mockDirectory.length });
      return;
    }
    const items = await getOrgPeople(req.auth!);
    res.json({ items, nextCursor: null, total: items.length });
  }),
);

// Merge the Hub-managed supplement (LinkedIn/working hours/bio + DOB/hire
// overrides) onto the person, without letting empty overrides hide Microsoft data.
const withSupplement = (person: DirectoryPerson): DirectoryPerson => {
  const s = getProfileSupplement(person.id);
  return {
    ...person,
    linkedIn: s.linkedIn ?? person.linkedIn,
    workingHours: s.workingHours ?? person.workingHours,
    bio: s.bio ?? person.bio,
    birthday: person.birthday ?? s.birthday,
    hireDate: person.hireDate ?? s.hireDate,
  };
};

apiRouter.get(
  '/directory/:id',
  requireCapability('directory.view'),
  live(async (req, res) => {
    if (isMock(req)) {
      const person = mockDirectory.find((p) => p.id === req.params.id);
      if (!person) {
        res.status(404).json({ error: { code: 'not_found', message: 'Person not found' } });
        return;
      }
      const manager = mockDirectory.find((p) => p.jobTitle === 'Founder & Principal');
      const chart: OrgChart = {
        person: withSupplement({ ...person, managerName: manager?.displayName }),
        manager,
        reports: mockDirectory.filter((p) => p.department === person.department && p.id !== person.id),
      };
      res.json(chart);
      return;
    }
    const chart = await getPersonChart(req.auth!, req.params.id);
    res.json({ ...chart, person: withSupplement(chart.person) });
  }),
);

// Directory member photo proxy — no raw Graph URL reaches the browser.
apiRouter.get(
  '/directory/:id/photo',
  requireCapability('directory.view'),
  live(async (req, res) => {
    if (isMock(req)) {
      res.status(404).end();
      return;
    }
    const photo = await getPersonPhoto(req.auth!, req.params.id);
    if (!photo) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(photo.buffer);
  }),
);

// --- Announcements ---------------------------------------------------------
apiRouter.get('/announcements', requireCapability('announcements.view'), (_req, res) => {
  const items = listAnnouncements();
  res.json({ items, nextCursor: null, total: items.length });
});

// --- Calendar --------------------------------------------------------------
apiRouter.get(
  '/calendar/today',
  requireCapability('calendar.view'),
  live(async (req, res) => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const companyToday = listCompanyEvents(start.toISOString(), end.toISOString());
    if (isMock(req)) {
      res.json({ items: [...companyToday, ...mockTodayEvents(new Date())], nextCursor: null });
      return;
    }
    const graph = await getEvents(req.auth!, start.toISOString(), end.toISOString());
    res.json({ ...graph, items: [...companyToday, ...graph.items] });
  }),
);

// Date-ranged read across the user's mailbox + shared company calendar.
apiRouter.get(
  '/calendar',
  requireCapability('calendar.view'),
  live(async (req, res) => {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const start = req.query.start ? String(req.query.start) : defaultStart;
    const end = req.query.end ? String(req.query.end) : defaultEnd;

    const companyEvents = listCompanyEvents(start, end);
    if (isMock(req)) {
      const items = [...companyEvents, ...mockRangeEvents(start, end)];
      res.json({ items, nextCursor: null, total: items.length });
      return;
    }
    const graph = await getEvents(req.auth!, start, end);
    const items = [...companyEvents, ...graph.items];
    res.json({ ...graph, items, total: items.length });
  }),
);

// --- Company holidays (admin-managed, shown on everyone's calendar) ---------
apiRouter.get('/holidays', requireCapability('calendar.view'), (_req, res) => {
  const items = listHolidays();
  res.json({ items, nextCursor: null, total: items.length });
});

const holidayBody = z.object({
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().max(500).optional(),
});

apiRouter.post('/holidays', requireCapability('holidays.manage'), (req, res) => {
  const parsed = holidayBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  res.status(201).json(createHoliday(parsed.data));
});

apiRouter.delete('/holidays/:id', requireCapability('holidays.manage'), (req, res) => {
  if (!deleteHoliday(req.params.id)) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Holiday not found' } });
  }
  res.status(204).end();
});

// --- Company events (admin-posted, shown on everyone's calendar) -----------
apiRouter.get('/company-events', requireCapability('calendar.view'), (_req, res) => {
  const items = listCompanyEvents();
  res.json({ items, nextCursor: null, total: items.length });
});

const companyEventBody = z.object({
  subject: z.string().min(1).max(255),
  start: z.string().min(1),
  end: z.string().min(1),
  isAllDay: z.boolean().optional(),
  location: z.string().max(200).optional(),
});

apiRouter.post('/company-events', requireCapability('holidays.manage'), (req, res) => {
  const parsed = companyEventBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const event = createCompanyEvent(parsed.data);
  pushBroadcast({ title: `New company event: ${event.subject}`, body: event.location ?? undefined, kind: 'system', link: '/calendar' });
  res.status(201).json(event);
});

apiRouter.delete('/company-events/:id', requireCapability('holidays.manage'), (req, res) => {
  if (!deleteCompanyEvent(req.params.id)) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Event not found' } });
  }
  res.status(204).end();
});

// Create an event → writes to the user's Outlook calendar (needs Calendars.ReadWrite).
const createEventBody = z
  .object({
    subject: z.string().min(1).max(255),
    start: z.string().min(1), // UTC ISO
    end: z.string().min(1),
    isAllDay: z.boolean().optional(),
    location: z.string().max(255).optional(),
    body: z.string().max(4000).optional(),
  })
  .refine((v) => new Date(v.end).getTime() > new Date(v.start).getTime(), {
    message: 'End must be after start',
    path: ['end'],
  });

apiRouter.post(
  '/calendar',
  requireCapability('calendar.view'),
  live(async (req, res) => {
    const parsed = createEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    if (isMock(req)) {
      // No real calendar in mock mode — echo back a created-looking event.
      res.status(201).json({
        id: `e-${Date.now()}`,
        subject: parsed.data.subject,
        start: parsed.data.start,
        end: parsed.data.end,
        isAllDay: parsed.data.isAllDay ?? false,
        location: parsed.data.location,
        source: 'personal',
      });
      return;
    }
    res.status(201).json(await createEvent(req.auth!, parsed.data));
  }),
);

// --- Requests & approvals --------------------------------------------------
// My requests
apiRouter.get(
  '/requests',
  requireCapability('requests.view'),
  live(async (req, res) => {
    const auth = req.auth!;
    if (useRequestStore(req)) {
      const items = listRequestsFor(auth.userId);
      res.json({ items, nextCursor: null, total: items.length });
      return;
    }
    const items = await dvListRequestsFor(auth, auth.userId);
    res.json({ items, nextCursor: null, total: items.length });
  }),
);

// Submit a request → persist → kick off the Power Automate approval flow.
const createRequestBody = z
  .object({
    type: z.enum(['leave', 'expense', 'document']),
    title: z.string().min(2).max(140),
    description: z.string().max(2000).optional(),
    amount: z.number().positive().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine((v) => v.type !== 'expense' || typeof v.amount === 'number', {
    message: 'Expense requests require an amount',
  })
  .refine((v) => v.type !== 'leave' || (v.startDate && v.endDate), {
    message: 'Leave requests require start and end dates',
  });

apiRouter.post(
  '/requests',
  requireCapability('requests.create'),
  live(async (req, res) => {
    const parsed = createRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    const auth = req.auth!;
    const requesterName = auth.isMock ? mockUser.displayName : auth.userId;
    const input = { ...parsed.data, requesterId: auth.userId, requesterName };

    const created = useRequestStore(req)
      ? createRequestRow(input)
      : await dvCreateRequest(auth, input);

    // Fire the approval flow (no-op in mock). The flow calls /flows/approval-callback later.
    await startApprovalFlow({
      requestId: created.id,
      type: created.type,
      title: created.title,
      requesterName: created.requesterName,
      approverName: created.approverName,
      amount: created.amount,
      startDate: created.startDate,
      endDate: created.endDate,
      callbackUrl: `${config.webOrigin.replace(/:\d+$/, '')}:${config.port}/flows/approval-callback`,
      callbackSecret: config.flows.callbackSecret,
    });

    res.status(201).json(created);
  }),
);

// Approver's queue
apiRouter.get(
  '/approvals/pending',
  requireCapability('requests.approve'),
  live(async (req, res) => {
    if (useRequestStore(req)) {
      const items = listPendingApprovals();
      res.json({ items, nextCursor: null, total: items.length });
      return;
    }
    const items = await dvListPendingApprovals(req.auth!);
    res.json({ items, nextCursor: null, total: items.length });
  }),
);

// In-app approve / reject (approvers). Complements the Teams adaptive-card path.
apiRouter.post(
  '/requests/:id/decision',
  requireCapability('requests.approve'),
  live(async (req, res) => {
    const decision = req.body?.decision;
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({ error: { code: 'bad_request', message: 'decision must be approved|rejected' } });
      return;
    }
    const auth = req.auth!;
    const approverName = auth.isMock ? mockUser.displayName : auth.userId;

    const updated = useRequestStore(req)
      ? setRequestStatus(req.params.id, decision, approverName)
      : await dvSetStatus(auth, req.params.id, decision, approverName);
    if (!updated) {
      res.status(404).json({ error: { code: 'not_found', message: 'Request not found' } });
      return;
    }
    // In-app notification for the requester + external notify flow.
    pushNotification(updated.requesterId, {
      title: `Request ${decision}`,
      body: `"${updated.title}" was ${decision} by ${approverName}.`,
      kind: 'approval',
      link: '/requests',
    });
    await sendNotifyFlow({
      title: `Request ${decision}`,
      body: `"${updated.title}" was ${decision} by ${approverName}.`,
      audience: updated.requesterId,
    });
    res.json(updated);
  }),
);

// --- SharePoint library connection (admin picker) --------------------------
// Which library is connected (everyone can check, to know if it's set up).
apiRouter.get(
  '/documents/connection',
  requireCapability('documents.view'),
  live(async (req, res) => {
    const scope = req.query.scope === 'clientdocs' ? 'clientdocs' : 'documents';
    if (isMock(req)) {
      // Mock mode: pretend a library is connected so the demo shows documents.
      res.json({
        connection: { scope, siteId: 'mock', siteName: 'FlowTech (demo)', driveId: 'mock', libraryName: 'Documents' },
      });
      return;
    }
    // Auto-connects the pinned FlowTech library by name (no picker needed).
    res.json({ connection: await ensureConnection(req.auth!, scope), fixed: isFixedLibrary(scope) });
  }),
);

// List SharePoint sites for the picker (admin only).
apiRouter.get(
  '/documents/sites',
  requireCapability('admin.settings.manage'),
  live(async (req, res) => {
    res.json({ items: await listSites(req.auth!) });
  }),
);

// List a site's document libraries (admin only).
apiRouter.get(
  '/documents/sites/:siteId/libraries',
  requireCapability('admin.settings.manage'),
  live(async (req, res) => {
    res.json({ items: await listLibraries(req.auth!, req.params.siteId) });
  }),
);

// Connect a library to Documents or Client Documents (admin only).
const connectBody = z.object({
  scope: z.enum(['documents', 'clientdocs']),
  siteId: z.string().min(1),
  siteName: z.string().min(1),
  driveId: z.string().min(1),
  libraryName: z.string().min(1),
  webUrl: z.string().optional(),
});
apiRouter.put('/documents/connection', requireCapability('admin.settings.manage'), (req, res) => {
  const parsed = connectBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  setConnection(parsed.data);
  res.json({ connection: parsed.data });
});

// Which library scope a documents request targets ('documents' | 'clientdocs').
const docScope = (req: Request): 'documents' | 'clientdocs' =>
  req.query.scope === 'clientdocs' ? 'clientdocs' : 'documents';

// --- Documents (SharePoint library) ----------------------------------------
apiRouter.get(
  '/documents',
  requireCapability('documents.view'),
  live(async (req, res) => {
    const path = req.query.path ? String(req.query.path) : '';
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    if (isMock(req)) {
      res.json({ items: mockDocuments, nextCursor: null, total: mockDocuments.length });
      return;
    }
    res.json(await listChildren(req.auth!, path, cursor, docScope(req)));
  }),
);

apiRouter.get(
  '/documents/search',
  requireCapability('documents.view'),
  live(async (req, res) => {
    const q = String(req.query.q ?? '');
    if (isMock(req)) {
      const ql = q.toLowerCase();
      const items = mockDocuments.filter((d) => d.name.toLowerCase().includes(ql));
      res.json({ items, nextCursor: null, total: items.length });
      return;
    }
    res.json(await searchDocuments(req.auth!, q, docScope(req)));
  }),
);

// Upload — raw binary body; filename + target folder come from the query.
apiRouter.put(
  '/documents/content',
  requireCapability('documents.upload'),
  express.raw({ type: '*/*', limit: '15mb' }),
  live(async (req, res) => {
    const name = String(req.query.name ?? '').trim();
    const path = req.query.path ? String(req.query.path) : '';
    if (!name) {
      res.status(400).json({ error: { code: 'bad_request', message: 'Missing file name' } });
      return;
    }
    if (isMock(req)) {
      res.json({
        id: `mock-${Date.now()}`,
        name,
        kind: 'file',
        size: (req.body as Buffer)?.length ?? 0,
        path: `${path}/${name}`.replace(/\/+/g, '/'),
        lastModifiedBy: mockUser.displayName,
        lastModifiedDateTime: new Date().toISOString(),
      });
      return;
    }
    res.json(await uploadFile(req.auth!, path, name, req.body as Buffer, docScope(req)));
  }),
);

// Download — streamed through the BFF so SharePoint permissions still apply.
apiRouter.get(
  '/documents/:id/download',
  requireCapability('documents.view'),
  live(async (req, res) => {
    if (isMock(req)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Download unavailable in mock mode' } });
      return;
    }
    const file = await downloadFile(req.auth!, req.params.id, docScope(req));
    res.setHeader('Content-Type', file.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    file.stream.pipe(res);
  }),
);

// Create a shareable link for a file (requires documents.share).
apiRouter.post(
  '/documents/:id/share',
  requireCapability('documents.share'),
  live(async (req, res) => {
    if (isMock(req)) {
      res.json({ webUrl: 'https://example.sharepoint.com/:mock-share-link', name: 'file' });
      return;
    }
    const body = z
      .object({ type: z.enum(['view', 'edit']).optional(), scope: z.enum(['organization', 'anonymous']).optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: { code: 'bad_request', message: body.error.message } });
      return;
    }
    const link = await createShareLink(req.auth!, req.params.id, body.data, docScope(req));
    res.json(link);
  }),
);

// --- Notifications ---------------------------------------------------------
apiRouter.get('/notifications', requireCapability('notifications.view'), (req, res) => {
  const items = listNotifications(req.auth!.userId);
  res.json({ items, nextCursor: null, total: items.length, unread: unreadCount(req.auth!.userId) });
});

apiRouter.post('/notifications/:id/read', requireCapability('notifications.view'), (req, res) => {
  markRead(req.auth!.userId, req.params.id);
  res.json({ ok: true, unread: unreadCount(req.auth!.userId) });
});

apiRouter.post('/notifications/read-all', requireCapability('notifications.view'), (req, res) => {
  const marked = markAllRead(req.auth!.userId);
  res.json({ ok: true, marked, unread: 0 });
});

// --- Assets (QR Trax) ------------------------------------------------------
apiRouter.get('/assets', requireCapability('assets.view'), (_req, res) => {
  const items = listAssets();
  res.json({ items, nextCursor: null, total: items.length });
});

const assetBody = z.object({
  tag: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  location: z.string().max(120).optional(),
  status: z.enum(['active', 'in-service', 'retired']),
  assignedTo: z.string().max(120).optional(),
  lastServicedDate: z.string().optional(),
});

apiRouter.post('/assets', requireCapability('assets.manage'), (req, res) => {
  const parsed = assetBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  res.status(201).json(createAsset(parsed.data));
});

apiRouter.put('/assets/:id', requireCapability('assets.manage'), (req, res) => {
  const parsed = assetBody.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const updated = updateAsset(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Asset not found' } });
  res.json(updated);
});

apiRouter.delete('/assets/:id', requireCapability('assets.manage'), (req, res) => {
  const ok = deleteAsset(req.params.id);
  if (!ok) return res.status(404).json({ error: { code: 'not_found', message: 'Asset not found' } });
  res.status(204).end();
});

// --- Quick links (available to any authenticated user) ---------------------
apiRouter.get('/quicklinks', (_req, res) => {
  res.json({ items: listQuickLinks(), nextCursor: null });
});

// Favicon proxy — renders an app's real logo without loosening the SPA's CSP
// (external images are blocked; this serves the icon from our own origin).
// Only the well-known Google favicon service is called, with a validated host,
// so no arbitrary/internal URL is ever fetched.
const HOSTNAME_RE = /^[a-z0-9.-]{1,253}\.[a-z]{2,}$/i;
apiRouter.get(
  '/quicklinks/icon',
  live(async (req, res) => {
    const host = String(req.query.host ?? '').toLowerCase();
    if (!HOSTNAME_RE.test(host)) {
      res.status(400).json({ error: { code: 'bad_request', message: 'Invalid host' } });
      return;
    }
    try {
      const upstream = await axios.get(
        `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
        { responseType: 'arraybuffer', timeout: 6000 },
      );
      res.setHeader('Content-Type', String(upstream.headers['content-type'] ?? 'image/png'));
      res.setHeader('Cache-Control', 'public, max-age=86400'); // a day
      res.end(Buffer.from(upstream.data));
    } catch {
      res.status(404).end();
    }
  }),
);

// --- Intranet features (projects, help desk, legal, client docs, vault) ----
apiRouter.use('/', intranetRouter);

// --- Admin console API (capability-gated inside) ---------------------------
apiRouter.use('/admin', adminRouter);
