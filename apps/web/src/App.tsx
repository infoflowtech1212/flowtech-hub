import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useMe } from '@/hooks/useApi';
import { ApiRequestError } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { AdminShell } from '@/components/AdminShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RequireCap } from '@/components/RequireCap';
import { Wordmark } from '@/components/Wordmark';
import { ErrorState, Skeleton } from '@/components/ui/states';

const SignIn = lazy(() => import('@/pages/SignIn'));
const PublicForm = lazy(() => import('@/pages/PublicForm'));

// Employee portal
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Directory = lazy(() => import('@/pages/Directory'));
const Documents = lazy(() => import('@/pages/Documents'));
const Calendar = lazy(() => import('@/pages/Calendar'));
const Requests = lazy(() => import('@/pages/Requests'));
const News = lazy(() => import('@/pages/News'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Assets = lazy(() => import('@/pages/Assets'));
const Projects = lazy(() => import('@/pages/Projects'));
const Legal = lazy(() => import('@/pages/Legal'));
const HelpDesk = lazy(() => import('@/pages/HelpDesk'));
const ClientDocuments = lazy(() => import('@/pages/ClientDocuments'));
const VaultOpen = lazy(() => import('@/pages/VaultOpen'));
const VaultPersonal = lazy(() => import('@/pages/VaultPersonal'));
const Expenses = lazy(() => import('@/pages/Expenses'));
const AdminNotes = lazy(() => import('@/pages/AdminNotes'));
const AppLinks = lazy(() => import('@/pages/AppLinks'));
const QuickNotes = lazy(() => import('@/pages/QuickNotes'));
const MyProfile = lazy(() => import('@/pages/MyProfile'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// Admin portal
const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'));
const AdminApprovals = lazy(() => import('@/pages/admin/AdminApprovals'));
const AdminRoles = lazy(() => import('@/pages/admin/AdminRoles'));
const AdminPeople = lazy(() => import('@/pages/admin/AdminPeople'));
const AdminProfiles = lazy(() => import('@/pages/admin/AdminProfiles'));
const AdminAccess = lazy(() => import('@/pages/admin/AdminAccess'));
const AdminEvents = lazy(() => import('@/pages/admin/AdminEvents'));
const AdminVault = lazy(() => import('@/pages/admin/AdminVault'));
const AdminTickets = lazy(() => import('@/pages/admin/AdminTickets'));
const AdminAnnouncements = lazy(() => import('@/pages/admin/AdminAnnouncements'));
const AdminQuickLinks = lazy(() => import('@/pages/admin/AdminQuickLinks'));

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink">
      <Wordmark className="scale-125" />
      {children ?? <Skeleton className="h-1 w-40" />}
    </div>
  );
}

export default function App() {
  // Public routes (the shareable form) render without sign-in.
  const isPublic = window.location.pathname.startsWith('/submit');

  const { data: me, isLoading, error, refetch } = useMe({ enabled: !isPublic });
  const authError = new URLSearchParams(window.location.search).get('authError') ?? undefined;

  if (isPublic) {
    return (
      <Suspense fallback={<Splash />}>
        <PublicForm />
      </Suspense>
    );
  }

  if (isLoading) return <Splash />;

  if (error instanceof ApiRequestError && error.status === 401) {
    return (
      <Suspense fallback={<Splash />}>
        <SignIn error={authError} />
      </Suspense>
    );
  }

  if (error || !me) {
    return (
      <Splash>
        <ErrorState message="Couldn't reach FlowTech Hub." onRetry={() => refetch()} />
      </Splash>
    );
  }

  return (
    <Routes>
      {/* Employee portal */}
      <Route element={<AppShell user={me} />}>
        <Route path="/" element={<RouteFrame><Dashboard /></RouteFrame>} />
        <Route
          path="/directory"
          element={<RouteFrame><RequireCap capability="directory.view"><Directory /></RequireCap></RouteFrame>}
        />
        <Route
          path="/documents"
          element={<RouteFrame><RequireCap capability="documents.view"><Documents /></RequireCap></RouteFrame>}
        />
        <Route
          path="/calendar"
          element={<RouteFrame><RequireCap capability="calendar.view"><Calendar /></RequireCap></RouteFrame>}
        />
        <Route
          path="/requests"
          element={<RouteFrame><RequireCap capability="requests.view"><Requests /></RequireCap></RouteFrame>}
        />
        <Route
          path="/news"
          element={<RouteFrame><RequireCap capability="announcements.view"><News /></RequireCap></RouteFrame>}
        />
        <Route
          path="/notifications"
          element={<RouteFrame><RequireCap capability="notifications.view"><Notifications /></RequireCap></RouteFrame>}
        />
        <Route
          path="/assets"
          element={<RouteFrame><RequireCap capability="assets.view"><Assets /></RequireCap></RouteFrame>}
        />
        {/* Intranet feature areas */}
        <Route path="/projects" element={<RouteFrame><RequireCap capability="projects.view"><Projects /></RequireCap></RouteFrame>} />
        <Route path="/legal" element={<RouteFrame><RequireCap capability="legal.view"><Legal /></RequireCap></RouteFrame>} />
        <Route path="/helpdesk" element={<RouteFrame><RequireCap capability="helpdesk.view"><HelpDesk /></RequireCap></RouteFrame>} />
        <Route path="/client-documents" element={<RouteFrame><RequireCap capability="clientdocs.view"><ClientDocuments /></RequireCap></RouteFrame>} />
        <Route path="/vault/open" element={<RouteFrame><RequireCap capability="vault.view"><VaultOpen /></RequireCap></RouteFrame>} />
        <Route path="/vault/personal" element={<RouteFrame><RequireCap capability="vault.view"><VaultPersonal /></RequireCap></RouteFrame>} />
        <Route path="/app-links" element={<RouteFrame><AppLinks /></RouteFrame>} />
        <Route path="/quick-notes" element={<RouteFrame><QuickNotes /></RouteFrame>} />
        <Route path="/profile" element={<RouteFrame><MyProfile /></RouteFrame>} />
        <Route path="*" element={<RouteFrame><NotFound /></RouteFrame>} />
      </Route>

      {/* Admin portal — gated by admin.access, distinct shell */}
      <Route
        path="/admin"
        element={
          <RequireCap capability="admin.access">
            <AdminShell user={me} />
          </RequireCap>
        }
      >
        <Route index element={<RouteFrame><AdminOverview /></RouteFrame>} />
        <Route
          path="roles"
          element={<RouteFrame><RequireCap capability="admin.roles.manage"><AdminRoles /></RequireCap></RouteFrame>}
        />
        <Route
          path="people"
          element={<RouteFrame><RequireCap capability="admin.users.manage"><AdminPeople /></RequireCap></RouteFrame>}
        />
        <Route
          path="profiles"
          element={<RouteFrame><RequireCap capability="admin.users.manage"><AdminProfiles /></RequireCap></RouteFrame>}
        />
        <Route
          path="access"
          element={<RouteFrame><RequireCap capability="admin.users.manage"><AdminAccess /></RequireCap></RouteFrame>}
        />
        <Route
          path="events"
          element={<RouteFrame><RequireCap capability="holidays.manage"><AdminEvents /></RequireCap></RouteFrame>}
        />
        <Route
          path="vault"
          element={<RouteFrame><RequireCap capability="vault.manage"><AdminVault /></RequireCap></RouteFrame>}
        />
        <Route
          path="tickets"
          element={<RouteFrame><RequireCap capability="helpdesk.manage"><AdminTickets /></RequireCap></RouteFrame>}
        />
        <Route
          path="approvals"
          element={<RouteFrame><RequireCap capability="requests.approve"><AdminApprovals /></RequireCap></RouteFrame>}
        />
        <Route
          path="expenses"
          element={<RouteFrame><RequireCap capability="expenses.view"><Expenses /></RequireCap></RouteFrame>}
        />
        <Route
          path="notes"
          element={<RouteFrame><RequireCap capability="notes.view"><AdminNotes /></RequireCap></RouteFrame>}
        />
        <Route
          path="announcements"
          element={<RouteFrame><RequireCap capability="admin.content.manage"><AdminAnnouncements /></RequireCap></RouteFrame>}
        />
        <Route
          path="quicklinks"
          element={<RouteFrame><RequireCap capability="admin.content.manage"><AdminQuickLinks /></RequireCap></RouteFrame>}
        />
      </Route>
    </Routes>
  );
}

/** Every route is isolated: a crash in one page shows a retry card, not a white screen. */
function RouteFrame({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
