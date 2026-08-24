import {
  CalendarDays,
  Clock,
  FileCheck,
  FileText,
  FolderKanban,
  FolderLock,
  GraduationCap,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  Megaphone,
  StickyNote,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '@flowtech/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Capability required to see this item; omit for everyone. */
  capability?: Capability;
  /** Exact-match highlight (for the dashboard root). */
  end?: boolean;
}

export interface NavGroup {
  /** Section label shown above the items (omit for the top group). */
  label?: string;
  items: NavItem[];
}

/**
 * Grouped left-sidebar navigation (briqbi-style). Existing pages are mapped;
 * new features (Projects, Legal, Help Desk, Client Documents, Password Vault)
 * currently render placeholder pages and get built out one by one.
 */
export const navGroups: NavGroup[] = [
  {
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/app-links', label: 'App Links', icon: Grid3x3 },
      { to: '/news', label: 'News', icon: Megaphone, capability: 'announcements.view' },
      { to: '/profile', label: 'My Profile', icon: UserRound },
      { to: '/quick-notes', label: 'Quick Notes', icon: StickyNote },
      { to: '/helpdesk', label: 'Help Desk', icon: LifeBuoy, capability: 'helpdesk.view' },
      { to: '/requests', label: 'Requests', icon: FileCheck, capability: 'requests.view' },
      { to: '/attendance', label: 'Attendance', icon: Clock, capability: 'attendance.view' },
      { to: '/calendar', label: 'Events', icon: CalendarDays, capability: 'calendar.view' },
      { to: '/documents', label: 'Documents', icon: FileText, capability: 'documents.view' },
      { to: '/client-documents', label: 'Client Documents', icon: FolderLock, capability: 'clientdocs.view' },
      { to: '/courses', label: 'Courses', icon: GraduationCap, capability: 'courses.view' },
      { to: '/directory', label: 'Organisation', icon: Users, capability: 'directory.view' },
      { to: '/projects', label: 'Projects', icon: FolderKanban, capability: 'projects.view' },
    ],
  },
  {
    label: 'Password Vault',
    items: [
      { to: '/vault/open', label: 'Open Vault', icon: KeyRound, capability: 'vault.view' },
      { to: '/vault/personal', label: 'Personal Vault', icon: Lock, capability: 'vault.view' },
    ],
  },
];
// Admin-only tools (Notes & Ideas, role/people/content management) live in the
// separate Admin portal (see AdminShell), not this employee sidebar.
