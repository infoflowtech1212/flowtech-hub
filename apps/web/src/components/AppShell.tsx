import { useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { GripVertical, LogOut, Menu, Search, X } from 'lucide-react';
import type { UserProfile } from '@flowtech/shared';
import { navGroups, type NavGroup, type NavItem } from '@/config/nav';
import { useCan } from '@/hooks/useCan';
import { useNavOrder, groupKey } from '@/hooks/useNavOrder';
import { initials } from '@/lib/format';
import { logout } from '@/lib/auth';
import { UserMenu } from './UserMenu';
import { NotificationMenu } from './NotificationMenu';
import { Logo } from './Logo';

/** Drag-and-drop state/handlers threaded down to each sidebar link. */
export interface NavDnd {
  onDragStart: (key: string, to: string) => void;
  onDrop: (key: string, tos: string[], targetTo: string) => void;
}

/**
 * Shell — a full-height dark sidebar (grouped nav, briqbi-style) on the left and
 * light content on the right with a thin top bar. Desktop-first; the sidebar
 * collapses to a slide-over on mobile.
 */
export function AppShell({ user }: { user: UserProfile }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { can } = useCan();
  const { applyOrder, reorder } = useNavOrder();
  const dragged = useRef<{ key: string; to: string } | null>(null);

  // Filter each group's items by capability; drop empty groups; apply saved order.
  const groups = applyOrder(
    navGroups
      .map((g) => ({ ...g, items: g.items.filter((n) => !n.capability || can(n.capability)) }))
      .filter((g) => g.items.length > 0),
  );

  const dnd: NavDnd = {
    onDragStart: (key, to) => (dragged.current = { key, to }),
    onDrop: (key, tos, targetTo) => {
      const d = dragged.current;
      if (d && d.key === key) reorder(key, tos, d.to, targetTo);
      dragged.current = null;
    },
  };

  return (
    <div className="min-h-screen bg-ink text-content">
      {/* Sidebar — desktop */}
      <Sidebar
        user={user}
        groups={groups}
        dnd={dnd}
        className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:flex"
      />

      {/* Sidebar — mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <Sidebar
            user={user}
            groups={groups}
            dnd={dnd}
            onNavigate={() => setMobileOpen(false)}
            className="absolute inset-y-0 left-0 flex w-64 animate-fade-up"
          />
        </div>
      )}

      {/* Content column */}
      <div className="lg:pl-64">
        {/* Thin top bar */}
        <header className="sticky top-0 z-20 border-b border-line/10 bg-ink/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <button
              className="rounded-lg p-2 text-muted hover:bg-line/5 lg:hidden"
              aria-label="Toggle navigation"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="hidden max-w-md flex-1 items-center gap-2 rounded-pill border border-line/10 bg-surface px-3 py-1.5 text-sm text-muted md:flex">
              <Search className="h-4 w-4" />
              <input
                className="w-full bg-transparent text-content placeholder:text-subtle focus:outline-none"
                placeholder="Search people, docs, events…"
                aria-label="Global search"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {can('notifications.view') && <NotificationMenu />}
              <UserMenu user={user} />
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

// --- Dark sidebar ----------------------------------------------------------
function Sidebar({
  user,
  groups,
  dnd,
  onNavigate,
  className = '',
}: {
  user: UserProfile;
  groups: NavGroup[];
  dnd?: NavDnd;
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
        <Link to="/" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 px-2" aria-label="FlowTech Hub home">
          <Logo size={32} />
          <span className="flex flex-col">
            <span className="text-lg font-extrabold uppercase leading-none tracking-[0.14em] text-white">
              Flow<span className="text-accent-bright">tech</span>
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-bright">Hub</span>
          </span>
        </Link>

        <nav className="space-y-5">
          {groups.map((group, gi) => {
            const key = groupKey(group, gi);
            const tos = group.items.map((i) => i.to);
            return (
              <div key={key}>
                {group.label && (
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.to}
                      item={item}
                      onNavigate={onNavigate}
                      dnd={dnd}
                      groupKey={key}
                      tos={tos}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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
  item,
  onNavigate,
  dnd,
  groupKey: key,
  tos,
}: {
  item: NavItem;
  onNavigate?: () => void;
  dnd?: NavDnd;
  groupKey: string;
  tos: string[];
}) {
  const { to, label, icon: Icon, end } = item;
  const [dragOver, setDragOver] = useState(false);
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      draggable={Boolean(dnd)}
      onDragStart={() => dnd?.onDragStart(key, to)}
      onDragOver={(e) => {
        if (!dnd) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!dnd) return;
        e.preventDefault();
        setDragOver(false);
        dnd.onDrop(key, tos, to);
      }}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          dragOver && 'ring-1 ring-accent/50',
          isActive ? 'bg-white text-[#0b0f1a]' : 'text-slate-300 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {dnd && (
            <GripVertical
              className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </>
      )}
    </NavLink>
  );
}

