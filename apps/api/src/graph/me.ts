import type { UserProfile } from '@flowtech/shared';
import { config } from '../config.js';
import type { AuthContext } from '../auth/middleware.js';
import { graphClientFor } from './client.js';

/** One-shot check (at login) whether the token holder is in the Entra admin
 *  group — the bootstrap-admin signal for the RBAC model. */
export async function checkAdminGroup(getGraphToken: () => Promise<string>): Promise<boolean> {
  if (!config.adminGroupId) return false;
  try {
    const client = graphClientFor(getGraphToken);
    const check = await client.api('/me/checkMemberGroups').post({ groupIds: [config.adminGroupId] });
    return Array.isArray(check?.value) && check.value.includes(config.adminGroupId);
  } catch {
    return false;
  }
}

// Entra "Global Administrator" role template — the person who runs the tenant /
// Microsoft 365 subscription. Override/extend with ADMIN_DIRECTORY_ROLE_IDS
// (comma-separated role template GUIDs) to treat other directory roles as admin.
const GLOBAL_ADMIN_ROLE_TEMPLATE = '62e90394-69f5-4237-9190-012177145e10';
const ADMIN_ROLE_TEMPLATE_IDS = (process.env.ADMIN_DIRECTORY_ROLE_IDS || GLOBAL_ADMIN_ROLE_TEMPLATE)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * One-shot check (at login) whether the signed-in user holds a Microsoft 365 /
 * Entra admin directory role (Global Administrator by default). This is the
 * primary admin signal — the admin portal is meant for tenant admins only.
 * Reads the user's own role memberships (least privilege: User.Read).
 */
export async function checkDirectoryAdmin(getGraphToken: () => Promise<string>): Promise<boolean> {
  try {
    const client = graphClientFor(getGraphToken);
    const res = await client
      .api('/me/memberOf/microsoft.graph.directoryRole')
      .select(['id', 'displayName', 'roleTemplateId'])
      .get();
    const roles: Array<{ roleTemplateId?: string }> = Array.isArray(res?.value) ? res.value : [];
    return roles.some((r) => r.roleTemplateId && ADMIN_ROLE_TEMPLATE_IDS.includes(r.roleTemplateId.toLowerCase()));
  } catch {
    return false;
  }
}

interface GraphUser {
  id: string;
  displayName?: string;
  givenName?: string;
  jobTitle?: string;
  department?: string;
  mail?: string;
  userPrincipalName?: string;
}

/**
 * Resolve the signed-in user's Graph profile fields. Roles + capabilities are
 * layered on by the /api/me route from the auth context (RBAC), not here. The
 * photo is loaded via the BFF-proxied `/api/me/photo` endpoint, so no raw Graph
 * URL reaches the browser.
 */
export async function getMyProfile(
  auth: AuthContext,
): Promise<Omit<UserProfile, 'roles' | 'capabilities'>> {
  const client = graphClientFor(auth.getGraphToken);

  const me: GraphUser = await client
    .api('/me')
    .select(['id', 'displayName', 'givenName', 'jobTitle', 'department', 'mail', 'userPrincipalName'])
    .get();

  return {
    id: me.id,
    displayName: me.displayName ?? me.userPrincipalName ?? 'Unknown',
    givenName: me.givenName,
    jobTitle: me.jobTitle,
    department: me.department,
    mail: me.mail ?? me.userPrincipalName,
    photoUrl: '/api/me/photo',
  };
}

/** Fetch the user's Graph photo as raw bytes for the BFF photo proxy. */
export async function getMyPhoto(auth: AuthContext): Promise<{ buffer: Buffer; contentType: string } | null> {
  const client = graphClientFor(auth.getGraphToken);
  try {
    const stream = (await client.api('/me/photo/$value').getStream()) as NodeJS.ReadableStream;
    const buffer = await streamToBuffer(stream);
    return { buffer, contentType: 'image/jpeg' };
  } catch {
    return null; // no photo set, or photo read not permitted
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
