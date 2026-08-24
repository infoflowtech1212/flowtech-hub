import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Announcement,
  Capability,
  CapabilityInfo,
  Paged,
  PersonProfileSupplement,
  QuickLink,
  Role,
  RoleAssignment,
} from '@flowtech/shared';
import { api } from '@/lib/api';

// ---- Capability catalog ---------------------------------------------------
export const useCapabilityCatalog = () =>
  useQuery({
    queryKey: ['admin', 'capabilities'],
    queryFn: () => api.get<Paged<CapabilityInfo>>('/admin/capabilities'),
    staleTime: Infinity,
  });

// ---- Roles ----------------------------------------------------------------
export const useRoles = () =>
  useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api.get<Paged<Role>>('/admin/roles') });

export function useRoleMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    qc.invalidateQueries({ queryKey: ['admin', 'people'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: { name: string; description?: string; capabilities: Capability[] }) =>
        api.post<Role>('/admin/roles', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; capabilities?: Capability[] }) =>
        api.put<Role>(`/admin/roles/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del<void>(`/admin/roles/${id}`),
      onSuccess: invalidate,
    }),
  };
}

// ---- People & access ------------------------------------------------------
export const usePeopleAccess = (q: string) =>
  useQuery({
    queryKey: ['admin', 'people', q],
    queryFn: () => api.get<Paged<RoleAssignment>>(`/admin/people?q=${encodeURIComponent(q)}`),
  });

export function useAssignRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      api.put(`/admin/people/${userId}/roles`, { roleIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'people'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

// ---- Document access control (per-user grants) ----------------------------
export interface AccessRow {
  userId: string;
  displayName: string;
  mail?: string;
  jobTitle?: string;
  grants: Capability[];
  /** True when the user is a bootstrap admin — grants here are a no-op for them (they already have every capability). */
  bootstrapAdmin?: boolean;
}

export const useDocumentAccess = (q: string) =>
  useQuery({
    queryKey: ['admin', 'access', q],
    queryFn: () => api.get<Paged<AccessRow>>(`/admin/access?q=${encodeURIComponent(q)}`),
  });

export function useSaveAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, grants }: { userId: string; grants: Capability[] }) =>
      api.put(`/admin/access/${userId}`, { grants }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'access'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

// ---- Person profile supplement (LinkedIn / hours / bio) -------------------
export const useProfileSupplement = (userId: string | null) =>
  useQuery({
    queryKey: ['admin', 'profile', userId],
    queryFn: () => api.get<PersonProfileSupplement>(`/admin/profiles/${userId}`),
    enabled: Boolean(userId),
  });

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: PersonProfileSupplement & { userId: string }) =>
      api.put<PersonProfileSupplement>(`/admin/profiles/${userId}`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'profile', vars.userId] });
      qc.invalidateQueries({ queryKey: ['directory', 'person', vars.userId] });
    },
  });
}

// ---- Announcements management ---------------------------------------------
export const useAdminAnnouncements = () =>
  useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => api.get<Paged<Announcement>>('/admin/announcements'),
  });

export function useAnnouncementMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    qc.invalidateQueries({ queryKey: ['announcements'] }); // employee-side feed
  };
  return {
    create: useMutation({
      mutationFn: (body: { title: string; body: string; category?: string; pinned?: boolean; imageUrl?: string }) =>
        api.post<Announcement>('/admin/announcements', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; title?: string; body?: string; category?: string; pinned?: boolean; imageUrl?: string }) =>
        api.put<Announcement>(`/admin/announcements/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del<void>(`/admin/announcements/${id}`),
      onSuccess: invalidate,
    }),
  };
}

// ---- Quick links management -----------------------------------------------
export const useAdminQuickLinks = () =>
  useQuery({
    queryKey: ['admin', 'quicklinks'],
    queryFn: () => api.get<Paged<QuickLink>>('/admin/quicklinks'),
  });

export function useSaveQuickLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ items, force }: { items: QuickLink[]; force?: boolean }) =>
      api.put<Paged<QuickLink>>('/admin/quicklinks', { items, force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'quicklinks'] });
      qc.invalidateQueries({ queryKey: ['quicklinks'] }); // employee dashboard widget
    },
  });
}
