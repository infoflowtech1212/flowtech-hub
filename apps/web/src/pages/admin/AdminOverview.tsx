import { Link } from 'react-router-dom';
import {
  Boxes,
  CheckSquare,
  FolderKanban,
  LifeBuoy,
  Megaphone,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useRoles, usePeopleAccess } from '@/hooks/useAdmin';
import { usePendingApprovals } from '@/hooks/useApi';
import { useExpenses, useProjects, useTickets } from '@/hooks/useIntranet';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';

const monthlyFactor: Record<string, number> = {
  'one-time': 0,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
};

export default function AdminOverview() {
  const { can } = useCan();
  const roles = useRoles();
  const people = usePeopleAccess('');
  const approvals = usePendingApprovals();
  const tickets = useTickets();
  const projects = useProjects();
  const expenses = useExpenses();

  const openTickets = (tickets.data?.items ?? []).filter((t) => t.status === 'open' || t.status === 'in-progress').length;
  const activeProjects = (projects.data?.items ?? []).filter((p) => p.status === 'active').length;
  const pending = approvals.data?.items.length ?? 0;

  // Monthly expense run-rate — grouped by currency, show the dominant one.
  const runRate = (() => {
    const byCurrency = new Map<string, number>();
    for (const e of expenses.data?.items ?? []) {
      if (e.status === 'cancelled') continue;
      const m = e.amount * (monthlyFactor[e.recurrence] ?? 0);
      if (m > 0) byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + m);
    }
    const top = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? money(top[1], top[0]) : '—';
  })();

  const kpis: Array<{ icon: LucideIcon; value: React.ReactNode; label: string; to?: string; highlight?: boolean }> = [
    { icon: Users, value: people.data?.items.length ?? '—', label: 'People', to: can('admin.users.manage') ? '/admin/people' : undefined },
    { icon: ShieldCheck, value: roles.data?.items.length ?? '—', label: 'Roles', to: can('admin.roles.manage') ? '/admin/roles' : undefined },
    { icon: CheckSquare, value: pending, label: 'Pending approvals', to: '/admin/approvals', highlight: pending > 0 },
    { icon: Wallet, value: runRate, label: 'Monthly run-rate', to: can('expenses.view') ? '/admin/expenses' : undefined },
    { icon: LifeBuoy, value: openTickets, label: 'Open tickets' },
    { icon: FolderKanban, value: activeProjects, label: 'Active projects' },
  ];

  const ticketByStatus = groupCount(tickets.data?.items ?? [], (t) => t.status);
  const expenseByCategory = groupCount(expenses.data?.items ?? [], (e) => e.category);

  const shortcuts = [
    { to: '/admin/roles', icon: ShieldCheck, title: 'Roles', desc: 'Define capabilities per role.', cap: 'admin.roles.manage' as const },
    { to: '/admin/people', icon: Users, title: 'People & Access', desc: 'Assign roles to employees.', cap: 'admin.users.manage' as const },
    { to: '/admin/approvals', icon: CheckSquare, title: 'Approvals', desc: 'Decide on pending requests.', cap: 'requests.approve' as const },
    { to: '/admin/expenses', icon: Wallet, title: 'Expenses', desc: 'Track software & resource spend.', cap: 'expenses.view' as const },
    { to: '/admin/announcements', icon: Megaphone, title: 'Announcements', desc: 'Publish company news.', cap: 'admin.content.manage' as const },
    { to: '/admin/quicklinks', icon: Boxes, title: 'Quick Links', desc: 'Curate the app launcher.', cap: 'admin.content.manage' as const },
  ].filter((s) => can(s.cap));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Analytics" subtitle="A live snapshot of activity across FlowTech." />

      {/* KPI grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <KpiTile key={k.label} {...k} />
        ))}
      </div>

      {/* Breakdowns */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Tickets by status">
          <Breakdown data={ticketByStatus} empty="No tickets yet" />
        </SectionCard>
        <SectionCard title="Expenses by category">
          <Breakdown data={expenseByCategory} empty="No expenses yet" />
        </SectionCard>
      </div>

      {/* Management shortcuts */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Manage</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to} className="ft-card group p-5 transition-colors hover:border-accent/40">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/12 text-accent-bright">
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-lg font-bold">{title}</p>
            <p className="mt-1 text-sm text-muted">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  value,
  label,
  to,
  highlight,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  to?: string;
  highlight?: boolean;
}) {
  const inner = (
    <div
      className={
        'flex h-full flex-col justify-between rounded-card border bg-surface p-4 transition-colors ' +
        (highlight ? 'border-amber-400/40' : 'border-line/10') +
        (to ? ' hover:border-accent/40' : '')
      }
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-accent-bright">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold leading-none text-content">{value}</p>
      <p className="mt-1 truncate text-xs text-muted">{label}</p>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function groupCount<T>(items: T[], key: (t: T) => string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Breakdown({ data, empty }: { data: Array<[string, number]>; empty: string }) {
  if (!data.length) return <p className="py-4 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...data.map(([, n]) => n));
  return (
    <ul className="space-y-2.5">
      {data.map(([label, n]) => (
        <li key={label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="capitalize text-content">{label.replace('-', ' ')}</span>
            <span className="text-muted">{n}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
