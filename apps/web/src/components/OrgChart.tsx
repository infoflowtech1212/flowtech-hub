import { useMemo } from 'react';
import type { DirectoryPerson } from '@flowtech/shared';
import { useOrgPeople } from '@/hooks/useApi';
import { SectionCard } from './ui/Page';
import { Avatar } from './ui/Avatar';
import { ErrorState, Skeleton } from './ui/states';

interface OrgNode extends DirectoryPerson {
  reports: OrgNode[];
}

/** Build a forest of org nodes from a flat people list (by managerId). */
function buildTree(people: DirectoryPerson[]): OrgNode[] {
  const byId = new Map<string, OrgNode>();
  people.forEach((p) => byId.set(p.id, { ...p, reports: [] }));
  const roots: OrgNode[] = [];
  byId.forEach((node) => {
    const mgr = node.managerId ? byId.get(node.managerId) : undefined;
    if (mgr) mgr.reports.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: OrgNode[]) => {
    nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
    nodes.forEach((n) => sortRec(n.reports));
  };
  sortRec(roots);
  return roots;
}

// Classic top-down org tree with connector lines (theme-aware via --tree-line).
const TREE_CSS = `
.org-tree { --tree-line: rgb(148 163 184 / 0.5); display: inline-block; min-width: 100%; }
.org-tree ul { position: relative; padding: 22px 0 0; display: flex; justify-content: center; }
.org-tree li { list-style: none; position: relative; padding: 22px 10px 0; text-align: center; }
.org-tree li::before, .org-tree li::after {
  content: ''; position: absolute; top: 0; right: 50%;
  border-top: 2px solid var(--tree-line); width: 50%; height: 22px;
}
.org-tree li::after { right: auto; left: 50%; border-left: 2px solid var(--tree-line); }
.org-tree li:only-child::after, .org-tree li:only-child::before { display: none; }
.org-tree li:only-child { padding-top: 22px; }
.org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
.org-tree li:last-child::before { border-right: 2px solid var(--tree-line); border-radius: 0 6px 0 0; }
.org-tree li:first-child::after { border-radius: 6px 0 0 0; }
.org-tree ul ul::before {
  content: ''; position: absolute; top: 0; left: 50%;
  border-left: 2px solid var(--tree-line); width: 0; height: 22px;
}
.org-tree > ul { padding-top: 0; }
.org-tree > ul > li:only-child { padding-top: 0; }
`;

/** Inline organisation chart — a proper top-down tree. */
export function OrgChart() {
  const { data, isLoading, isError, refetch } = useOrgPeople(true);
  const roots = useMemo(() => (data?.items ? buildTree(data.items) : []), [data]);

  return (
    <SectionCard title="Reporting hierarchy">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !roots.length ? (
        <p className="py-8 text-center text-sm text-muted">No reporting data available.</p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <style>{TREE_CSS}</style>
          <div className="org-tree">
            <ul>
              {roots.map((node) => (
                <TreeNode key={node.id} node={node} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function TreeNode({ node }: { node: OrgNode }) {
  return (
    <li>
      <div className="inline-flex w-40 flex-col items-center gap-1 rounded-card border border-line/15 bg-surface px-3 py-3 shadow-sm">
        <Avatar name={node.displayName} src={`/api/directory/${node.id}/photo`} size={44} />
        <p className="mt-1 max-w-full truncate text-sm font-semibold text-content">{node.displayName}</p>
        <p className="max-w-full truncate text-xs text-muted">{node.jobTitle ?? '—'}</p>
        {node.reports.length > 0 && (
          <span className="mt-1 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent-bright">
            {node.reports.length} report{node.reports.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {node.reports.length > 0 && (
        <ul>
          {node.reports.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
