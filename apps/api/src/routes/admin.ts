/**
 * Admin management API. Every route is capability-gated (defense in depth: the
 * client hides these, but the BFF is the authority). Data is mock-persisted in
 * dev; in live mode the people list comes from Graph while role/assignment and
 * content stores are in-memory (TODO(prod): Dataverse).
 */
import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Capability, RoleAssignment } from '@flowtech/shared';
import { config, USE_MOCKS } from '../config.js';
import { listPeople } from '../graph/directory.js';
import { getMyProfile, listBootstrapAdminUserIds } from '../graph/me.js';
import { isReauthRequiredError } from '../auth/tokens.js';
import { requireCapability } from '../auth/middleware.js';
import {
  ALL_CAPABILITIES,
  CAPABILITY_CATALOG,
  createRole,
  deleteRole,
  getAssignedRoleIds,
  getUserGrants,
  listRoles,
  replaceAllAssignmentsInStore,
  replaceAllGrantsInStore,
  replaceAllRolesInStore,
  replaceRoleInStore,
  roleNamesFor,
  setAssignedRoleIds,
  setUserGrants,
  updateRole,
} from '../auth/permissions.js';
import {
  dvCreateRole,
  dvDeleteRole,
  dvListAllAssignments,
  dvListRoles,
  dvSetAssignedRoleIds,
  dvUpdateRole,
  rolesDataverseEnabled,
} from '../dataverse/roles.js';
import { dvGetUserGrants, dvListAllGrants, dvSetUserGrants, grantsDataverseEnabled } from '../dataverse/grants.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  listQuickLinks,
  setQuickLinks,
  updateAnnouncement,
} from '../store/content.js';
import { getProfileSupplement, setProfileSupplement } from '../store/profiles.js';
import { dvGetProfile, dvSetProfile, profilesDataverseEnabled } from '../dataverse/profiles.js';
import { pushBroadcast, pushNotification } from '../store/notifications.js';
import { mockDirectory } from '../mocks.js';
import { dateStr, listAllRecordsFor, listCurrentlyWorking } from '../store/attendance.js';
import {
  attendanceDataverseEnabled,
  dvListAllRecordsFor,
  dvListCurrentlyWorking,
} from '../dataverse/attendance.js';
import { listAllRequests } from '../store/requests.js';
import { dvListAllRequests, requestsDataverseEnabled } from '../dataverse/requests.js';
import { dvListQuickLinks, dvSetQuickLinks, quickLinksDataverseEnabled } from '../dataverse/quickLinks.js';
import {
  dvCreateAnnouncement,
  dvDeleteAnnouncement,
  dvListAnnouncements,
  dvUpdateAnnouncement,
  announcementDataverseEnabled,
} from '../dataverse/announcements.js';

export const adminRouter = Router();

// The whole admin surface requires the base admin.access capability.
adminRouter.use(requireCapability('admin.access'));

const asyncH =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (isReauthRequiredError(err)) {
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

// --- Roles -------------------------------------------------------------------
// Dataverse is the durable source of truth once DATAVERSE_ROLE_TABLE is
// configured; the in-memory store (permissions.ts) is always also kept in
// sync (mirrored below) since it's the hot-path cache every request reads
// for authorization — see permissions.ts's file comment for why.
const useRoleStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !rolesDataverseEnabled();

adminRouter.get(
  '/roles',
  requireCapability('admin.roles.manage'),
  asyncH(async (req, res) => {
    if (useRoleStore(req)) {
      res.json({ items: listRoles() });
      return;
    }
    const roles = await dvListRoles();
    replaceAllRolesInStore(roles); // heals the cache if a role was added directly in Dataverse
    res.json({ items: roles });
  }),
);

const roleBody = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(240).optional(),
  capabilities: z.array(capabilityEnum),
});

adminRouter.post(
  '/roles',
  requireCapability('admin.roles.manage'),
  asyncH(async (req, res) => {
    const parsed = roleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    if (useRoleStore(req)) {
      res.status(201).json(createRole(parsed.data));
      return;
    }
    const id = `role-${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`;
    const role = await dvCreateRole(id, parsed.data);
    createRole(parsed.data, id); // mirror into the hot-path cache with the same id
    res.status(201).json(role);
  }),
);

adminRouter.put(
  '/roles/:id',
  requireCapability('admin.roles.manage'),
  asyncH(async (req, res) => {
    const parsed = roleBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    if (useRoleStore(req)) {
      const updated = updateRole(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: { code: 'not_found', message: 'Role not found' } });
        return;
      }
      res.json(updated);
      return;
    }
    const updated = await dvUpdateRole(req.params.id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: { code: 'not_found', message: 'Role not found' } });
      return;
    }
    replaceRoleInStore(updated); // mirror the exact guarded result into the hot-path cache
    res.json(updated);
  }),
);

adminRouter.delete(
  '/roles/:id',
  requireCapability('admin.roles.manage'),
  asyncH(async (req, res) => {
    const ok = useRoleStore(req) ? deleteRole(req.params.id) : await dvDeleteRole(req.params.id);
    if (!ok) {
      res.status(400).json({ error: { code: 'protected', message: 'System roles cannot be deleted' } });
      return;
    }
    if (!useRoleStore(req)) deleteRole(req.params.id); // mirror (idempotent/safe if already absent)
    res.status(204).end();
  }),
);

// --- People & access -------------------------------------------------------
adminRouter.get(
  '/people',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const q = String(req.query.q ?? '');
    const base = USE_MOCKS
      ? mockDirectory
      : (await listPeople(req.auth!, q)).items;
    // Bootstrap-admin signal: the ADMIN_EMAILS allowlist (cheap, always
    // checkable) plus a bulk Graph lookup of who holds the admin directory
    // role / is in the Entra admin group (needs Directory.Read.All — see
    // listBootstrapAdminUserIds's own comment; degrades to just the
    // allowlist if that permission isn't granted).
    const adminUserIds = USE_MOCKS ? new Set<string>() : await listBootstrapAdminUserIds(req.auth!.getGraphToken);
    // Read assignments fresh from Dataverse rather than the mirrored cache —
    // the cache can be stale for a role added directly in Dataverse (see
    // replaceAllRolesInStore's comment), which would otherwise make an
    // assignment to it look silently missing here. Resync the cache with
    // this fresh read at the same time.
    let assignedRoleIds: (userId: string) => string[];
    if (useRoleStore(req)) {
      assignedRoleIds = getAssignedRoleIds;
    } else {
      const fresh = await dvListAllAssignments();
      replaceAllAssignmentsInStore(fresh);
      assignedRoleIds = (userId) => fresh.get(userId) ?? [];
    }
    const people: RoleAssignment[] = base.map((p) => ({
      userId: p.id,
      displayName: p.displayName,
      mail: p.mail,
      jobTitle: p.jobTitle,
      roleIds: assignedRoleIds(p.id),
      bootstrapAdmin: Boolean((p.mail && config.adminEmails.includes(p.mail.toLowerCase())) || adminUserIds.has(p.id)),
    }));
    res.json({ items: people });
  }),
);

const assignBody = z.object({ roleIds: z.array(z.string()) });

adminRouter.put(
  '/people/:id/roles',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    const roleIds = useRoleStore(req)
      ? setAssignedRoleIds(req.params.id, parsed.data.roleIds)
      : await dvSetAssignedRoleIds(req.params.id, parsed.data.roleIds);
    if (!useRoleStore(req)) setAssignedRoleIds(req.params.id, roleIds); // mirror into the hot-path cache
    const roleNames = roleNamesFor(roleIds);
    pushNotification(req.params.id, {
      title: 'Your role was updated',
      body: roleNames.length ? `You're now assigned: ${roleNames.join(', ')}.` : 'Your role assignment changed.',
      kind: 'system',
    });
    res.json({ userId: req.params.id, roleIds, roleNames });
  }),
);

// --- Document access control (per-user grants) -----------------------------
// Only document-related capabilities are grantable here (no privilege escalation).
// 'documents.view' is deliberately excluded: it's a baseline capability every
// employee gets via the default Employee role (see EMPLOYEE_CAPS in
// auth/capabilities.ts), so resolveCapabilities()'s purely-additive
// role-union-grants model can never revoke it per person — listing it here
// would show a checkbox that looks controllable but isn't.
const DOC_ACCESS_CAPS: Capability[] = [
  'documents.upload',
  'documents.share',
  'clientdocs.view',
  'clientdocs.manage',
];

// Dataverse is the durable source of truth once DATAVERSE_GRANT_TABLE is
// configured; the in-memory store (permissions.ts) is always also kept in
// sync since it's the hot-path cache resolveCapabilities() reads.
const useGrantStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !grantsDataverseEnabled();

adminRouter.get(
  '/access',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const q = String(req.query.q ?? '');
    const base = USE_MOCKS ? mockDirectory : (await listPeople(req.auth!, q)).items;
    // Same bootstrap-admin signal as GET /people — grants here are a no-op
    // for a bootstrap admin (resolveCapabilities short-circuits to every
    // capability for them), so the UI needs to say so.
    const adminUserIds = USE_MOCKS ? new Set<string>() : await listBootstrapAdminUserIds(req.auth!.getGraphToken);
    // Read fresh from Dataverse rather than the mirrored cache, and resync the
    // cache at the same time — same reasoning as GET /people (a grant set
    // directly in Dataverse would otherwise look silently missing here).
    let grantsFor: (userId: string) => Capability[];
    if (useGrantStore(req)) {
      grantsFor = getUserGrants;
    } else {
      const fresh = await dvListAllGrants();
      replaceAllGrantsInStore(fresh);
      grantsFor = (userId) => fresh.get(userId) ?? [];
    }
    const items = base.map((p) => ({
      userId: p.id,
      displayName: p.displayName,
      mail: p.mail,
      jobTitle: p.jobTitle,
      grants: grantsFor(p.id).filter((c) => DOC_ACCESS_CAPS.includes(c)),
      bootstrapAdmin: Boolean((p.mail && config.adminEmails.includes(p.mail.toLowerCase())) || adminUserIds.has(p.id)),
    }));
    res.json({ items });
  }),
);

const accessBody = z.object({ grants: z.array(capabilityEnum) });

adminRouter.put(
  '/access/:id',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const parsed = accessBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    const docGrants = parsed.data.grants.filter((c) => DOC_ACCESS_CAPS.includes(c));
    let grants: Capability[];
    if (useGrantStore(req)) {
      // Keep any existing non-document grants; replace only the document ones.
      const keep = getUserGrants(req.params.id).filter((c) => !DOC_ACCESS_CAPS.includes(c));
      grants = setUserGrants(req.params.id, [...keep, ...docGrants]);
    } else {
      const keep = (await dvGetUserGrants(req.params.id)).filter((c) => !DOC_ACCESS_CAPS.includes(c));
      grants = await dvSetUserGrants(req.params.id, [...keep, ...docGrants]);
      setUserGrants(req.params.id, grants); // mirror into the hot-path cache
    }
    const finalGrants = grants.filter((c) => DOC_ACCESS_CAPS.includes(c));
    pushNotification(req.params.id, {
      title: 'Your document access was updated',
      body: finalGrants.length ? `You now have: ${finalGrants.join(', ')}.` : 'Your document access grants were cleared.',
      kind: 'system',
      link: '/documents',
    });
    res.json({ userId: req.params.id, grants: finalGrants });
  }),
);

// --- People: Hub-managed profile supplement (LinkedIn / hours / bio) -------
const profileBody = z.object({
  linkedIn: z.string().max(300).optional(),
  workingHours: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  birthday: z.string().max(40).optional(),
  hireDate: z.string().max(40).optional(),
});

const useProfileStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !profilesDataverseEnabled();

adminRouter.get(
  '/profiles/:id',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    res.json(useProfileStore(req) ? getProfileSupplement(req.params.id) : await dvGetProfile(req.params.id));
  }),
);

adminRouter.put(
  '/profiles/:id',
  requireCapability('admin.users.manage'),
  asyncH(async (req, res) => {
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    res.json(
      useProfileStore(req)
        ? setProfileSupplement(req.params.id, parsed.data)
        : await dvSetProfile(req.params.id, parsed.data),
    );
  }),
);

// --- Content: announcements ------------------------------------------------
const useAnnouncementStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !announcementDataverseEnabled();

adminRouter.get(
  '/announcements',
  requireCapability('admin.content.manage'),
  asyncH(async (req, res) => {
    const items = useAnnouncementStore(req) ? listAnnouncements() : await dvListAnnouncements();
    res.json({ items });
  }),
);

const announcementBody = z.object({
  title: z.string().min(2).max(140),
  body: z.string().min(1).max(4000),
  category: z.string().max(40).optional(),
  pinned: z.boolean().optional(),
  // Optional banner image — a data URI (uploaded) or an image URL.
  imageUrl: z.string().max(3_000_000).optional(),
});

/** Resolves the real display name via Graph in live mode — req.auth.userId is just the Entra oid. */
async function authorName(req: Request): Promise<string> {
  const auth = req.auth!;
  return auth.isMock ? 'Alex Morgan' : (await getMyProfile(auth)).displayName;
}

adminRouter.post(
  '/announcements',
  requireCapability('admin.content.manage'),
  asyncH(async (req, res) => {
    const parsed = announcementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    const author = await authorName(req);
    const announcement = useAnnouncementStore(req)
      ? createAnnouncement({ ...parsed.data, author })
      : await dvCreateAnnouncement({ ...parsed.data, author });
    // Notify every employee about the new announcement.
    pushBroadcast({ title: announcement.title, body: announcement.body.slice(0, 140), kind: 'announcement', link: '/news' });
    res.status(201).json(announcement);
  }),
);

adminRouter.put(
  '/announcements/:id',
  requireCapability('admin.content.manage'),
  asyncH(async (req, res) => {
    const parsed = announcementBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    try {
      const updated = useAnnouncementStore(req)
        ? updateAnnouncement(req.params.id, parsed.data)
        : await dvUpdateAnnouncement(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
        return;
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof Error && err.message === 'not_found') {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
        return;
      }
      throw err;
    }
  }),
);

adminRouter.delete(
  '/announcements/:id',
  requireCapability('admin.content.manage'),
  asyncH(async (req, res) => {
    try {
      if (useAnnouncementStore(req)) {
        const ok = deleteAnnouncement(req.params.id);
        if (!ok) {
          res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
          return;
        }
        res.status(204).end();
        return;
      }
      await dvDeleteAnnouncement(req.params.id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message === 'not_found') {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
        return;
      }
      throw err;
    }
  }),
);

// --- Content: quick links --------------------------------------------------
const quickLinksBody = z.object({
  // Confirms an intentional bulk removal — see the drop-guard below.
  force: z.boolean().optional(),
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

const useQuickLinkStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !quickLinksDataverseEnabled();

adminRouter.get(
  '/quicklinks',
  requireCapability('admin.content.manage'),
  asyncH(async (req, res) => {
    const items = useQuickLinkStore(req) ? listQuickLinks() : await dvListQuickLinks();
    res.json({ items });
  }),
);

adminRouter.put(
  '/quicklinks',
  requireCapability('admin.content.manage'),
  asyncH(async (req, res) => {
    const parsed = quickLinksBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    if (useQuickLinkStore(req)) {
      res.json({ items: setQuickLinks(parsed.data.items) });
      return;
    }
    // Save replaces the whole Dataverse list — guard against a stale client
    // (e.g. a browser tab left open since before the current list grew)
    // silently wiping most of it. Whoever's saving must explicitly confirm.
    if (!parsed.data.force) {
      const current = await dvListQuickLinks();
      const droppedMost = current.length >= 5 && parsed.data.items.length < current.length / 2;
      if (droppedMost) {
        res.status(409).json({
          error: {
            code: 'confirm_required',
            message: `This save would remove ${current.length - parsed.data.items.length} of ${current.length} existing links. Refresh the page to make sure you're editing the current list, then save again to proceed.`,
          },
        });
        return;
      }
    }
    res.json({ items: await dvSetQuickLinks(parsed.data.items) });
  }),
);

// --- Attendance (team-wide, view-only) --------------------------------------
const useAttendanceStore = (req: Request) => (req.auth?.isMock ?? USE_MOCKS) || !attendanceDataverseEnabled();

adminRouter.get(
  '/attendance/today',
  requireCapability('attendance.manage'),
  asyncH(async (req, res) => {
    const working = useAttendanceStore(req) ? listCurrentlyWorking() : await dvListCurrentlyWorking(dateStr());
    const items = working.map((r) => ({
      userId: r.userId,
      userName: r.userName,
      checkIn: r.checkIn,
      elapsedMinutes: Math.round((Date.now() - new Date(r.checkIn).getTime()) / 60000),
    }));
    res.json({ items, nextCursor: null, total: items.length });
  }),
);

adminRouter.get(
  '/attendance',
  requireCapability('attendance.manage'),
  asyncH(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const items = useAttendanceStore(req) ? listAllRecordsFor(from, to) : await dvListAllRecordsFor(from, to);
    res.json({ items, nextCursor: null, total: items.length });
  }),
);

// --- Requests (team-wide, view-only — approvers see every request here) ----
adminRouter.get(
  '/requests',
  requireCapability('requests.approve'),
  asyncH(async (req, res) => {
    const useLocalStore = (req.auth?.isMock ?? USE_MOCKS) || !requestsDataverseEnabled();
    const items = useLocalStore ? listAllRequests() : await dvListAllRequests();
    res.json({ items, nextCursor: null, total: items.length });
  }),
);
