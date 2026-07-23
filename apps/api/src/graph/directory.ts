import type { DirectoryPerson, OrgChart, Paged } from '@flowtech/shared';
import type { AuthContext } from '../auth/middleware.js';
import { graphClientFor } from './client.js';

interface GraphUser {
  id: string;
  displayName?: string;
  jobTitle?: string;
  department?: string;
  mail?: string;
  userPrincipalName?: string;
  officeLocation?: string;
  mobilePhone?: string;
  accountEnabled?: boolean;
  userType?: string;
  birthday?: string;
  employeeHireDate?: string;
}

const asDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1 ? undefined : d.toISOString().slice(0, 10);
};

const SELECT = [
  'id',
  'displayName',
  'jobTitle',
  'department',
  'mail',
  'userPrincipalName',
  'officeLocation',
  'mobilePhone',
];

function toPerson(u: GraphUser): DirectoryPerson {
  return {
    id: u.id,
    displayName: u.displayName ?? u.userPrincipalName ?? 'Unknown',
    jobTitle: u.jobTitle,
    department: u.department,
    mail: u.mail ?? u.userPrincipalName,
    officeLocation: u.officeLocation,
    mobilePhone: u.mobilePhone,
    birthday: asDate(u.birthday),
    hireDate: asDate(u.employeeHireDate),
    // Photos skipped for now — the client renders initials.
  };
}

// Active organisation members only (excludes guests, disabled accounts).
const ACTIVE_MEMBERS = "accountEnabled eq true and userType eq 'Member'";

/**
 * Search / list people from Entra ID. Uses Graph `$search` (requires the
 * `ConsistencyLevel: eventual` header) when a query is present, else a plain
 * ordered page. `cursor` is Graph's opaque `@odata.nextLink`.
 */
export async function listPeople(
  auth: AuthContext,
  q: string,
  cursor?: string,
): Promise<Paged<DirectoryPerson>> {
  const client = graphClientFor(auth.getGraphToken);

  // If we have a cursor, follow the nextLink directly.
  if (cursor) {
    const page = await client.api(cursor).get();
    return {
      items: (page.value as GraphUser[]).map(toPerson),
      nextCursor: page['@odata.nextLink'] ?? null,
    };
  }

  // $filter on accountEnabled, $search, and $orderby+$count all require Graph's
  // "advanced query" mode: ConsistencyLevel: eventual + $count=true.
  let req = client
    .api('/users')
    .header('ConsistencyLevel', 'eventual')
    .count(true)
    .select(SELECT)
    .top(25);
  if (q) {
    // $search returns by relevance — don't combine with $orderby.
    req = req.search(`"displayName:${q}" OR "mail:${q}"`).filter(ACTIVE_MEMBERS);
  } else {
    req = req.filter(ACTIVE_MEMBERS).orderby('displayName');
  }

  const page = await req.get();
  return {
    items: (page.value as GraphUser[]).map(toPerson),
    nextCursor: page['@odata.nextLink'] ?? null,
  };
}

/** All people with their managerId populated (for the org chart). Uses Graph
 *  $expand=manager so we get the hierarchy in one read. */
export async function getOrgPeople(auth: AuthContext): Promise<DirectoryPerson[]> {
  const client = graphClientFor(auth.getGraphToken);
  // Graph doesn't allow $expand together with the advanced query (eventual /
  // $count / $filter on accountEnabled), so fetch plainly with the manager
  // expanded, then filter to active members + sort in code.
  const page = await client
    .api('/users')
    .select([...SELECT, 'accountEnabled', 'userType'])
    .expand('manager($select=id)')
    .top(999)
    .get();
  return (page.value as (GraphUser & { manager?: { id?: string } })[])
    .filter((u) => u.accountEnabled !== false && u.userType !== 'Guest')
    .map((u) => ({ ...toPerson(u), managerId: u.manager?.id }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** A person plus their manager and direct reports (org chart). */
export async function getPersonChart(auth: AuthContext, id: string): Promise<OrgChart> {
  const client = graphClientFor(auth.getGraphToken);

  // Plain per-user read can include the HR/date fields (no advanced query).
  const person: GraphUser = await client
    .api(`/users/${id}`)
    .select([...SELECT, 'birthday', 'employeeHireDate'])
    .get();

  const [manager, reports] = await Promise.all([
    client
      .api(`/users/${id}/manager`)
      .select(SELECT)
      .get()
      .catch(() => null), // no manager (e.g. the CEO) is not an error
    client
      .api(`/users/${id}/directReports`)
      .select(SELECT)
      .get()
      .catch(() => ({ value: [] })),
  ]);

  const managerPerson = manager ? toPerson(manager as GraphUser) : undefined;
  return {
    person: { ...toPerson(person), managerName: managerPerson?.displayName },
    manager: managerPerson,
    reports: ((reports?.value ?? []) as GraphUser[]).map(toPerson),
  };
}

/** Raw photo bytes for a directory member (BFF photo proxy). */
export async function getPersonPhoto(
  auth: AuthContext,
  id: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const client = graphClientFor(auth.getGraphToken);
  try {
    const stream = (await client.api(`/users/${id}/photo/$value`).getStream()) as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { buffer: Buffer.concat(chunks), contentType: 'image/jpeg' };
  } catch {
    return null;
  }
}
