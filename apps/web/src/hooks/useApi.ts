import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Announcement,
  ApprovalRequest,
  Asset,
  CalendarEvent,
  Celebrations,
  DirectoryPerson,
  DocumentItem,
  Holiday,
  Notification,
  OrgChart,
  Paged,
  PersonProfileSupplement,
  QuickLink,
  RequestType,
  UserProfile,
} from '@flowtech/shared';

type NotificationsResponse = Paged<Notification> & { unread: number };
import { api } from '@/lib/api';

// ---- Identity -------------------------------------------------------------
export const useMe = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<UserProfile>('/me'),
    staleTime: Infinity,
    enabled: opts?.enabled ?? true,
  });

// ---- My profile (self-service supplement) ---------------------------------
export const useMyProfile = () =>
  useQuery({ queryKey: ['me', 'profile'], queryFn: () => api.get<PersonProfileSupplement>('/me/profile') });

export function useSaveMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonProfileSupplement) => api.put<PersonProfileSupplement>('/me/profile', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'profile'] });
      qc.invalidateQueries({ queryKey: ['directory'] });
    },
  });
}

// ---- Directory ------------------------------------------------------------
/** Paginated people search (Graph nextLink cursors). */
export const useDirectory = (q: string) =>
  useInfiniteQuery({
    queryKey: ['directory', q],
    queryFn: ({ pageParam }) =>
      api.get<Paged<DirectoryPerson>>(
        `/directory?q=${encodeURIComponent(q)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/** Org chart (manager + reports) for a person — only when a person is selected. */
export const usePersonChart = (id: string | null) =>
  useQuery({
    queryKey: ['directory', 'person', id],
    queryFn: () => api.get<OrgChart>(`/directory/${id}`),
    enabled: Boolean(id),
  });

/** Everyone with managerId, for building the full organisation chart. */
export const useOrgPeople = (enabled: boolean) =>
  useQuery({
    queryKey: ['directory', 'org'],
    queryFn: () => api.get<Paged<DirectoryPerson>>('/directory/org'),
    enabled,
  });

// ---- Celebrations (birthdays + work anniversaries) ------------------------
export const useCelebrations = () =>
  useQuery({
    queryKey: ['celebrations'],
    queryFn: () => api.get<Celebrations>('/celebrations'),
    staleTime: 6 * 60 * 60 * 1000, // changes at most daily
  });

// ---- Dashboard widgets ----------------------------------------------------
export const useTodayEvents = () =>
  useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: () => api.get<Paged<CalendarEvent>>('/calendar/today'),
  });

/** Date-ranged events across personal + company calendars. */
export const useCalendar = (startIso: string, endIso: string) =>
  useQuery({
    queryKey: ['calendar', 'range', startIso, endIso],
    queryFn: () =>
      api.get<Paged<CalendarEvent>>(
        `/calendar?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
      ),
  });

// ---- Company events (admin-posted, on everyone's calendar) ----------------
export const useCompanyEvents = () =>
  useQuery({ queryKey: ['company-events'], queryFn: () => api.get<Paged<CalendarEvent>>('/company-events') });

export function useCompanyEventMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['company-events'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: { subject: string; start: string; end: string; isAllDay?: boolean; location?: string }) =>
        api.post<CalendarEvent>('/company-events', body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/company-events/${id}`), onSuccess: invalidate }),
  };
}

// ---- Company holidays -----------------------------------------------------
export const useHolidays = () =>
  useQuery({ queryKey: ['holidays'], queryFn: () => api.get<Paged<Holiday>>('/holidays') });

export function useHolidayMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['holidays'] });
  return {
    create: useMutation({
      mutationFn: (body: { name: string; date: string; description?: string }) =>
        api.post<Holiday>('/holidays', body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/holidays/${id}`), onSuccess: invalidate }),
  };
}

export interface CreateEventInput {
  subject: string;
  start: string; // UTC ISO
  end: string; // UTC ISO
  isAllDay?: boolean;
  location?: string;
  body?: string;
}

/** Create an event on the user's Outlook calendar (syncs to Outlook). */
export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventInput) => api.post<CalendarEvent>('/calendar', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });
}

export const usePendingApprovals = () =>
  useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<Paged<ApprovalRequest>>('/approvals/pending'),
  });

export const useAnnouncements = () =>
  useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get<Paged<Announcement>>('/announcements'),
  });

export const useQuickLinks = () =>
  useQuery({
    queryKey: ['quicklinks'],
    queryFn: () => api.get<Paged<QuickLink>>('/quicklinks'),
  });

// ---- Documents (SharePoint) -----------------------------------------------
export interface SharePointSite {
  id: string;
  name: string;
  webUrl?: string;
}
export interface LibraryConnection {
  scope: 'documents' | 'clientdocs';
  siteId: string;
  siteName: string;
  driveId: string;
  libraryName: string;
  webUrl?: string;
}

export const useLibraryConnection = (scope: 'documents' | 'clientdocs' = 'documents') =>
  useQuery({
    queryKey: ['documents', 'connection', scope],
    queryFn: () =>
      api.get<{ connection: LibraryConnection | null; fixed?: boolean }>(`/documents/connection?scope=${scope}`),
  });

export const useSharePointSites = (enabled: boolean) =>
  useQuery({
    queryKey: ['sharepoint', 'sites'],
    queryFn: () => api.get<Paged<SharePointSite>>('/documents/sites'),
    enabled,
  });

export const useSharePointLibraries = (siteId: string | null) =>
  useQuery({
    queryKey: ['sharepoint', 'libraries', siteId],
    queryFn: () => api.get<Paged<SharePointSite>>(`/documents/sites/${siteId}/libraries`),
    enabled: Boolean(siteId),
  });

export function useConnectLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryConnection) => api.put('/documents/connection', body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['documents', 'connection', vars.scope] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

type DocScope = 'documents' | 'clientdocs';

export const useDocuments = (path: string, scope: DocScope = 'documents') =>
  useQuery({
    queryKey: ['documents', scope, path],
    queryFn: () =>
      api.get<Paged<DocumentItem>>(`/documents?path=${encodeURIComponent(path)}&scope=${scope}`),
  });

/** Create a shareable SharePoint link for a file (requires documents.share). */
export function useShareDocument(scope: DocScope = 'documents') {
  return useMutation({
    mutationFn: ({ id, type, linkScope }: { id: string; type?: 'view' | 'edit'; linkScope?: 'organization' | 'anonymous' }) =>
      api.post<{ webUrl: string; name: string }>(`/documents/${id}/share?scope=${scope}`, {
        type,
        scope: linkScope,
      }),
  });
}

export const useDocumentSearch = (q: string, scope: DocScope = 'documents') =>
  useQuery({
    queryKey: ['documents', scope, 'search', q],
    queryFn: () =>
      api.get<Paged<DocumentItem>>(`/documents/search?q=${encodeURIComponent(q)}&scope=${scope}`),
    enabled: q.trim().length > 1,
  });

export const useRequests = () =>
  useQuery({ queryKey: ['requests'], queryFn: () => api.get<Paged<ApprovalRequest>>('/requests') });

export interface CreateRequestInput {
  type: RequestType;
  title: string;
  description?: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRequestInput) => api.post<ApprovalRequest>('/requests', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
    },
  });
}

export function useDecideRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      api.post<ApprovalRequest>(`/requests/${id}/decision`, { decision }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsResponse>('/notifications'),
    enabled,
    refetchInterval: 60_000, // light polling so the unread badge stays fresh
  });

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ---- Assets ---------------------------------------------------------------
export const useAssets = () =>
  useQuery({ queryKey: ['assets'], queryFn: () => api.get<Paged<Asset>>('/assets') });

export function useAssetMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['assets'] });
  return {
    create: useMutation({
      mutationFn: (body: Omit<Asset, 'id'>) => api.post<Asset>('/assets', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: Partial<Asset> & { id: string }) =>
        api.put<Asset>(`/assets/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del<void>(`/assets/${id}`),
      onSuccess: invalidate,
    }),
  };
}
