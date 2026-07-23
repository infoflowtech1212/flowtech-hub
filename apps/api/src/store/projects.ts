import { randomUUID } from 'node:crypto';
import type { Project } from '@flowtech/shared';

/** Mutable in-memory projects store (dev/mock). TODO(prod): Dataverse table. */
let projects: Project[] = [
  {
    id: 'pj-001',
    name: 'FlowTech Hub rollout',
    description: 'Stand up the internal intranet across all teams.',
    status: 'active',
    owner: 'Alex Morgan',
    progress: 62,
    startDate: new Date(Date.now() - 20 * 864e5).toISOString(),
    dueDate: new Date(Date.now() + 40 * 864e5).toISOString(),
    tags: ['internal', 'platform'],
    createdDateTime: new Date(Date.now() - 21 * 864e5).toISOString(),
  },
  {
    id: 'pj-002',
    name: 'Meridian portfolio review',
    description: 'Quarterly strategy review for the Meridian account.',
    status: 'planning',
    owner: 'Hannah Klein',
    progress: 15,
    dueDate: new Date(Date.now() + 25 * 864e5).toISOString(),
    tags: ['client'],
    createdDateTime: new Date(Date.now() - 6 * 864e5).toISOString(),
  },
  {
    id: 'pj-003',
    name: 'PRISM data model',
    status: 'on-hold',
    owner: 'Marcus Webb',
    progress: 40,
    createdDateTime: new Date(Date.now() - 30 * 864e5).toISOString(),
  },
];

const byCreatedDesc = (a: Project, b: Project) =>
  new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime();

export const listProjects = (): Project[] => [...projects].sort(byCreatedDesc);

export function createProject(input: Omit<Project, 'id' | 'createdDateTime'>): Project {
  const project: Project = {
    id: `pj-${randomUUID().slice(0, 8)}`,
    createdDateTime: new Date().toISOString(),
    ...input,
  };
  projects.unshift(project);
  return project;
}

export function updateProject(id: string, patch: Partial<Omit<Project, 'id'>>): Project | undefined {
  const p = projects.find((x) => x.id === id);
  if (!p) return undefined;
  Object.assign(p, patch);
  return { ...p };
}

export function deleteProject(id: string): boolean {
  const before = projects.length;
  projects = projects.filter((p) => p.id !== id);
  return projects.length < before;
}
