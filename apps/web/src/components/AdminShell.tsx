import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  CheckSquare,
  FolderLock,
  IdCard,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  Lightbulb,
  LogOut,
  Megaphone,
  Menu,
  ShieldCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Capability, UserProfile } from '@flowtech/shared';
import { useCan } from '@/hooks/useCan';
import { initials } from '@/lib/format';
import { logout } from '@/lib/auth';
import { NotificationMenu } from './NotificationMenu';
import { Logo } from './Logo';

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
  end?: boolean;
}
interface AdminNavGroup {
  label?: string;
  items: AdminNavItem[];
}

/** Grouped admin navigation — same shape/feel as the employee Hub sidebar. */
const adminGroups: AdminNavGroup[] = [
  { items: [{ to: '/admin', label: 'Overview', icon: LayoutGrid, capability: 'admin.access', end: true }] },
  {
    label: 'Workspace',
    items: [
      { to: '/admin/approvals', label: 'Approvals', icon: CheckSquare, capability: 'requests.approve' },
      { to: '/admin/tickets', label: 'Help Desk', icon: LifeBuoy, capability: 'helpdesk.manage' },
      { to: '/admin/expenses', label: 'Expenses', icon: Wallet, capability: 'expenses.view' },
      { to: '/admin/vault', label: 'Shared Vault', icon: KeyRound, capability: 'vault.manage' },
      { to: '/admin/notes', label: 'Notes & Ideas', icon: Lightbulb, capability: 'notes.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/roles', label: 'Roles', icon: ShieldCheck, capability: 'admin.roles.manage' },
      { to: '/admin/people', label: 'People & Access', icon: Users, capability: 'admin.users.manage' },
      { to: '/admin/profiles', label: 'Employee Profiles', icon: IdCard, capability: 'admin.users.manage' },
      { to: '/admin/access', label: 'Document Access', icon: FolderLock, capability: 'admin.users.manage' },
      { to: '/admin/events', label: 'Events & Holidays', icon: CalendarDays, capability: 'holidays.manage' },
      { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, capability: 'admin.content.manage' },
      { to: '/admin/quicklinks', label: 'Quick Links', icon: Boxes, capability: 'admin.content.manage' },
    ],
  },
];

/**
 * Admin portal shell — mirrors the employee AppShell (dark grouped sidebar,
 * brand lockup, user footer) so the two portals feel like one product. An
 * "ADMIN" badge and a "Back to Hub" action mark it as the distinct surface.
 */
export function AdminShell({ user }: { user: UserProfile }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { can } = useCan();

  // Filter items by capability; drop empty groups.
  const groups = adminGroups
    .map((g) => ({ ...g, items: g.items.filter((n) => !n.capability || can(n.capability)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-ink text-content">
      {/* Sidebar — desktop */}
      <Sidebar user={user} groups={groups} className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:flex" />

      {/* Sidebar — mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <Sidebar
            user={user}
            groups={groups}
            onNavigate={() => setMobileOpen(false)}
            className="absolute inset-y-0 left-0 flex w-64 animate-fade-up"
          />
        </div>
      )}

      {/* Content column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line/10 bg-ink/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <button
              className="rounded-lg p-2 text-muted hover:bg-line/5 lg:hidden"
              aria-label="Toggle navigation"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-bright">
                Admin Panel
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <NotificationMenu />
              <Link to="/" className="ft-btn-ghost">
                <ArrowLeft className="h-4 w-4" /> Back to Hub
              </Link>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// --- Dark sidebar (matches the employee Hub) -------------------------------
function Sidebar({
  user,
  groups,
  onNavigate,
  className = '',
}: {
  user: UserProfile;
  groups: AdminNavGroup[];
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <aside
      className={clsx('flex-col justify-between bg-[#0b0f1a] text-slate-300', className)}
      style={{ display: 'flex' }}
    >
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {/* Brand lockup */}
        <Link to="/admin" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 px-2" aria-label="FlowTech Admin">
          <Logo size={32} />
          <span className="flex flex-col">
            <span className="text-lg font-extrabold uppercase leading-none tracking-[0.14em] text-white">
              Flow<span className="text-accent-bright">tech</span>
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-bright">
              <ShieldCheck className="h-3 w-3" /> Admin
            </span>
          </span>
        </Link>

        <nav className="space-y-5">
          {groups.map((group, gi) => (
            <div key={group.label ?? `g${gi}`}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    Icon={item.icon}
                    end={item.end}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* User footer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/25 text-xs font-semibold text-accent-bright">
            {initials(user.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
            <p className="truncate text-[11px] text-slate-400">{user.mail}</p>
          </div>
          <button
            onClick={() => logout()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  to,
  label,
  Icon,
  end,
  onNavigate,
}: {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-white text-[#0b0f1a]' : 'text-slate-300 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </>
      )}
    </NavLink>
  );
}
