import type { Project, ProjectStatus } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for Projects — a team-wide list (no per-owner
 * scoping; anyone with projects.view sees every row). Written by the app's
 * own application user (client-credentials token), so no per-employee
 * Dataverse license is needed. Same pattern as dataverse/vault.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/projects.csv for a ready-to-import template).
 *
 * Enabled only when DATAVERSE_PROJECT_TABLE is set; otherwise the app uses
 * the built-in in-memory store, which is lost on every redeploy.
 */
// Defaults below match the live `ft_projectses` table (Power Platform admin
// center → FlowTech - L+M Asset Transitions → Tables → projects → Columns).
const TABLE = process.env.DATAVERSE_PROJECT_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_PROJECT_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_PROJECT_ID_COL || `${P}projectsid`;
const NAME_COL = process.env.DATAVERSE_PROJECT_NAME_COL || `${P}projectname`;
const DESCRIPTION_COL = process.env.DATAVERSE_PROJECT_DESCRIPTION_COL || `${P}projectdescription`;
const STATUS_COL = process.env.DATAVERSE_PROJECT_STATUS_COL || `${P}projectstatus`;
const OWNER_COL = process.env.DATAVERSE_PROJECT_OWNER_COL || `${P}projectowner`;
const PROGRESS_COL = process.env.DATAVERSE_PROJECT_PROGRESS_COL || `${P}progresspercentage`;
const STARTDATE_COL = process.env.DATAVERSE_PROJECT_STARTDATE_COL || `${P}startdate`;
const DUEDATE_COL = process.env.DATAVERSE_PROJECT_DUEDATE_COL || `${P}duedate`;
const TAGS_COL = process.env.DATAVERSE_PROJECT_TAGS_COL || `${P}projecttags`;

export const projectDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  NAME_COL,
  DESCRIPTION_COL,
  STATUS_COL,
  OWNER_COL,
  PROGRESS_COL,
  STARTDATE_COL,
  DUEDATE_COL,
  TAGS_COL,
].join(',')},createdon`;

const toDto = (r: DvRow): Project => ({
  id: r[ID_COL] as string,
  name: (r[NAME_COL] as string) ?? '',
  description: (r[DESCRIPTION_COL] as string | null) ?? undefined,
  status: ((r[STATUS_COL] as ProjectStatus | null) ?? 'planning') as ProjectStatus,
  owner: (r[OWNER_COL] as string) ?? '',
  progress: (r[PROGRESS_COL] as number | null) ?? 0,
  startDate: (r[STARTDATE_COL] as string | null) ?? undefined,
  dueDate: (r[DUEDATE_COL] as string | null) ?? undefined,
  tags: ((r[TAGS_COL] as string | null) || '').split(',').filter(Boolean),
  createdDateTime: (r.createdon as string) ?? '',
});

export async function dvListProjects(): Promise<Project[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}&$orderby=createdon desc`);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateProject(input: Omit<Project, 'id' | 'createdDateTime'>): Promise<Project> {
  const row: Record<string, unknown> = {
    [NAME_COL]: input.name,
    [DESCRIPTION_COL]: input.description,
    [STATUS_COL]: input.status,
    [OWNER_COL]: input.owner,
    [PROGRESS_COL]: input.progress,
    [STARTDATE_COL]: input.startDate,
    [DUEDATE_COL]: input.dueDate,
    [TAGS_COL]: input.tags?.join(','),
  };
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

/** Pre-check so a stale/missing id maps to a clean 404 at the route instead of a raw Dataverse error. */
async function assertExists(id: string): Promise<void> {
  const url = `/${TABLE}?$select=${ID_COL}&$filter=${ID_COL} eq ${id}&$top=1`;
  const { data } = await client().get(url);
  if (!(data.value as DvRow[])[0]) throw new Error('not_found');
}

export async function dvUpdateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdDateTime'>>): Promise<Project> {
  await assertExists(id);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row[NAME_COL] = patch.name;
  if (patch.description !== undefined) row[DESCRIPTION_COL] = patch.description;
  if (patch.status !== undefined) row[STATUS_COL] = patch.status;
  if (patch.owner !== undefined) row[OWNER_COL] = patch.owner;
  if (patch.progress !== undefined) row[PROGRESS_COL] = patch.progress;
  if (patch.startDate !== undefined) row[STARTDATE_COL] = patch.startDate;
  if (patch.dueDate !== undefined) row[DUEDATE_COL] = patch.dueDate;
  if (patch.tags !== undefined) row[TAGS_COL] = patch.tags.join(',');
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteProject(id: string): Promise<void> {
  await assertExists(id);
  await client().delete(`/${TABLE}(${id})`);
}
