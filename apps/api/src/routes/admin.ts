/**
 * Admin management API. Every route is capability-gated (defense in depth: the
 * client hides these, but the BFF is the authority). Data is mock-persisted in
 * dev; in live mode the people list comes from Graph while role/assignment and
 * content stores are in-memory (TODO(prod): Dataverse).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Capability, RoleAssignment } from '@flowtech/shared';
import { USE_MOCKS } from '../config.js';
import { listPeople } from '../graph/directory.js';
import { ReauthRequiredError } from '../auth/tokens.js';
import { requireCapability } from '../auth/middleware.js';
import {
  ALL_CAPABILITIES,
  CAPABILITY_CATALOG,
  createRole,
  deleteRole,
  getAssignedRoleIds,
  getUserGrants,
  listRoles,
  roleNamesFor,
  setAssignedRoleIds,
  setUserGrants,
  updateRole,
} from '../auth/permissions.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  listQuickLinks,
  setQuickLinks,
  updateAnnouncement,
} from '../store/content.js';
import { getProfileSupplement, setProfileSupplement } from '../store/profiles.js';
import { pushBroadcast } from '../store/notifications.js';
import { mockDirectory } from '../mocks.js';

export const adminRouter = Router();

// The whole admin surface requires the base admin.access capability.
adminRouter.use(requireCapability('admin.access'));

const asyncH =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign-in required' } });
        return;
      }
      next(err);
    }
  };

const capabilityEnum = z.enum(ALL_CAPABILITIES as [Capability, ...Capability[]]);

// --- Capability catalog (for the role editor) ------------------------------
adminRouter.get('/capabilities', (_req, res) => {
  res.json({ items: CAPABILITY_CATALOG });
});

// --- Roles -----------------------------------------------------------------
adminRouter.get('/roles', requireCapability('admin.roles.manage'), (_req, res) => {
  res.json({ items: listRoles() });
});

const roleBody = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(240).optional(),
  capabilities: z.array(capabilityEnum),
});

adminRouter.post('/roles', requireCapability('admin.roles.manage'), (req, res) => {
  const parsed = roleBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  res.status(201).json(createRole(parsed.data));
});

adminRouter.put('/roles/:id', requireCapability('admin.roles.manage'), (req, res) => {
  const parsed = roleBody.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const updated = updateRole(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Role not found' } });
  res.json(updated);
});

adminRouter.delete('/roles/:id', requireCapability('admin.roles.manage'), (req, res) => {
  const ok = deleteRole(req.params.id);
  if (!ok) {
    return res
      .status(400)
      .json({ error: { code: 'protected', message: 'System roles cannot be deleted' } });
  }
  res.status(204).end();
});

// --- People & access -------------------------------------------------------
adminRouter.get(
  '/people',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const q = String(req.query.q ?? '');
    const base = USE_MOCKS
      ? mockDirectory
      : (await listPeople(req.auth!, q)).items;
    const people: RoleAssignment[] = base.map((p) => ({
      userId: p.id,
      displayName: p.displayName,
      mail: p.mail,
      jobTitle: p.jobTitle,
      roleIds: getAssignedRoleIds(p.id),
    }));
    res.json({ items: people });
  }),
);

const assignBody = z.object({ roleIds: z.array(z.string()) });

adminRouter.put('/people/:id/roles', requireCapability('admin.users.manage'), (req, res) => {
  const parsed = assignBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const roleIds = setAssignedRoleIds(req.params.id, parsed.data.roleIds);
  res.json({ userId: req.params.id, roleIds, roleNames: roleNamesFor(roleIds) });
});

// --- Document access control (per-user grants) -----------------------------
// Only document-related capabilities are grantable here (no privilege escalation).
const DOC_ACCESS_CAPS: Capability[] = [
  'documents.view',
  'documents.upload',
  'documents.share',
  'clientdocs.view',
  'clientdocs.manage',
];

adminRouter.get(
  '/access',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const q = String(req.query.q ?? '');
    const base = USE_MOCKS ? mockDirectory : (await listPeople(req.auth!, q)).items;
    const items = base.map((p) => ({
      userId: p.id,
      displayName: p.displayName,
      mail: p.mail,
      jobTitle: p.jobTitle,
      grants: getUserGrants(p.id).filter((c) => DOC_ACCESS_CAPS.includes(c)),
    }));
    res.json({ items });
  }),
);

const accessBody = z.object({ grants: z.array(capabilityEnum) });

adminRouter.put('/access/:id', requireCapability('admin.users.manage'), (req, res) => {
  const parsed = accessBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  // Keep any existing non-document grants; replace only the document ones.
  const keep = getUserGrants(req.params.id).filter((c) => !DOC_ACCESS_CAPS.includes(c));
  const docGrants = parsed.data.grants.filter((c) => DOC_ACCESS_CAPS.includes(c));
  const grants = setUserGrants(req.params.id, [...keep, ...docGrants]);
  res.json({ userId: req.params.id, grants: grants.filter((c) => DOC_ACCESS_CAPS.includes(c)) });
});

// --- People: Hub-managed profile supplement (LinkedIn / hours / bio) -------
const profileBody = z.object({
  linkedIn: z.string().max(300).optional(),
  workingHours: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  birthday: z.string().max(40).optional(),
  hireDate: z.string().max(40).optional(),
});

adminRouter.get('/profiles/:id', requireCapability('admin.users.manage'), (req, res) => {
  res.json(getProfileSupplement(req.params.id));
});

adminRouter.put('/profiles/:id', requireCapability('admin.users.manage'), (req, res) => {
  const parsed = profileBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  res.json(setProfileSupplement(req.params.id, parsed.data));
});

// --- Content: announcements ------------------------------------------------
adminRouter.get('/announcements', requireCapability('admin.content.manage'), (_req, res) => {
  res.json({ items: listAnnouncements() });
});

const announcementBody = z.object({
  title: z.string().min(2).max(140),
  body: z.string().min(1).max(4000),
  category: z.string().max(40).optional(),
  pinned: z.boolean().optional(),
  // Optional banner image — a data URI (uploaded) or an image URL.
  imageUrl: z.string().max(3_000_000).optional(),
});

adminRouter.post('/announcements', requireCapability('admin.content.manage'), (req, res) => {
  const parsed = announcementBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const author = req.auth?.isMock ? 'Alex Morgan' : (req.auth?.userId ?? 'Admin');
  const announcement = createAnnouncement({ ...parsed.data, author });
  // Notify every employee about the new announcement.
  pushBroadcast({ title: announcement.title, body: announcement.body.slice(0, 140), kind: 'announcement', link: '/news' });
  res.status(201).json(announcement);
});

adminRouter.put('/announcements/:id', requireCapability('admin.content.manage'), (req, res) => {
  const parsed = announcementBody.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  const updated = updateAnnouncement(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.json(updated);
});

adminRouter.delete('/announcements/:id', requireCapability('admin.content.manage'), (req, res) => {
  const ok = deleteAnnouncement(req.params.id);
  if (!ok) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  res.status(204).end();
});

// --- Content: quick links --------------------------------------------------
const quickLinksBody = z.object({
  items: z.array(
    z.object({
      id: z.string().optional().default(''),
      label: z.string().min(1).max(60),
      url: z.string().min(1).max(400), // may be a full URL or '#' placeholder
      icon: z.string().max(40).optional(),
      logo: z.string().max(1_500_000).optional(), // data URI or image URL
      category: z.string().max(60).optional(),
    }),
  ),
});

adminRouter.get('/quicklinks', requireCapability('admin.content.manage'), (_req, res) => {
  res.json({ items: listQuickLinks() });
});

adminRouter.put('/quicklinks', requireCapability('admin.content.manage'), (req, res) => {
  const parsed = quickLinksBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
  }
  res.json({ items: setQuickLinks(parsed.data.items) });
});
