import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminNote,
  ClientDocument,
  Expense,
  LegalDocument,
  Paged,
  Project,
  QuickNote,
  Ticket,
  VaultEntry,
  VaultScope,
} from '@flowtech/shared';
import { api } from '@/lib/api';

// ---- Projects -------------------------------------------------------------
export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => api.get<Paged<Project>>('/projects') });

export function useProjectMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['projects'] });
  return {
    create: useMutation({
      mutationFn: (body: Omit<Project, 'id' | 'createdDateTime'>) => api.post<Project>('/projects', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: Partial<Project> & { id: string }) => api.put<Project>(`/projects/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/projects/${id}`), onSuccess: invalidate }),
  };
}

// ---- Help Desk ------------------------------------------------------------
export const useTickets = () =>
  useQuery({ queryKey: ['tickets'], queryFn: () => api.get<Paged<Ticket>>('/helpdesk/tickets') });

export function useTicketMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tickets'] });
  return {
    create: useMutation({
      mutationFn: (body: { subject: string; description?: string; category: string; priority: Ticket['priority'] }) =>
        api.post<Ticket>('/helpdesk/tickets', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; status?: Ticket['status']; assignee?: string }) =>
        api.put<Ticket>(`/helpdesk/tickets/${id}`, body),
      onSuccess: invalidate,
    }),
  };
}

// ---- Legal ----------------------------------------------------------------
export const useLegal = () =>
  useQuery({ queryKey: ['legal'], queryFn: () => api.get<Paged<LegalDocument>>('/legal') });

export function useLegalMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['legal'] });
  return {
    create: useMutation({
      mutationFn: (body: Omit<LegalDocument, 'id' | 'createdDateTime'>) => api.post<LegalDocument>('/legal', body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/legal/${id}`), onSuccess: invalidate }),
  };
}

// ---- Client Documents -----------------------------------------------------
export const useClientDocs = () =>
  useQuery({ queryKey: ['client-documents'], queryFn: () => api.get<Paged<ClientDocument>>('/client-documents') });

export function useClientDocMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client-documents'] });
  return {
    create: useMutation({
      mutationFn: (body: { name: string; client: string; category?: string; size?: number; url?: string }) =>
        api.post<ClientDocument>('/client-documents', body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/client-documents/${id}`), onSuccess: invalidate }),
  };
}

// ---- Expense tracker ------------------------------------------------------
export const useExpenses = () =>
  useQuery({ queryKey: ['expenses'], queryFn: () => api.get<Paged<Expense>>('/expenses') });

type ExpenseInput = Omit<Expense, 'id' | 'createdDateTime' | 'updatedDateTime'>;

export function useExpenseMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses'] });
  return {
    create: useMutation({
      mutationFn: (body: ExpenseInput) => api.post<Expense>('/expenses', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: Partial<Expense> & { id: string }) => api.put<Expense>(`/expenses/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/expenses/${id}`), onSuccess: invalidate }),
  };
}

// ---- Admin notes / ideas (admins only) ------------------------------------
export const useNotes = () =>
  useQuery({ queryKey: ['notes'], queryFn: () => api.get<Paged<AdminNote>>('/notes') });

export function useNoteMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notes'] });
  return {
    create: useMutation({
      mutationFn: (body: { title: string; body: string; pinned?: boolean }) => api.post<AdminNote>('/notes', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; title?: string; body?: string; pinned?: boolean }) =>
        api.put<AdminNote>(`/notes/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/notes/${id}`), onSuccess: invalidate }),
  };
}

// ---- Quick notes (private per-employee) -----------------------------------
export const useQuickNotes = () =>
  useQuery({ queryKey: ['quicknotes'], queryFn: () => api.get<Paged<QuickNote>>('/quicknotes') });

export function useQuickNoteMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['quicknotes'] });
  return {
    create: useMutation({
      mutationFn: (body: { title?: string; body: string; color?: QuickNote['color'] }) =>
        api.post<QuickNote>('/quicknotes', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; title?: string; body?: string; color?: QuickNote['color'] }) =>
        api.put<QuickNote>(`/quicknotes/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del<void>(`/quicknotes/${id}`), onSuccess: invalidate }),
  };
}

// ---- Vault PIN (second security layer, independent per vault) -------------
export const useVaultPinStatus = (scope: VaultScope) =>
  useQuery({ queryKey: ['vault-pin', scope], queryFn: () => api.get<{ isSet: boolean }>(`/vault-pin/${scope}`) });

export function useSetVaultPin(scope: VaultScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pin: string; currentPin?: string }) =>
      api.post<{ ok: boolean; isSet: boolean }>(`/vault-pin/${scope}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault-pin', scope] }),
  });
}

export function useVerifyVaultPin(scope: VaultScope) {
  return useMutation({
    mutationFn: (pin: string) => api.post<{ ok: boolean }>(`/vault-pin/${scope}/verify`, { pin }),
  });
}

// ---- Password Vault -------------------------------------------------------
export const useVault = (scope: VaultScope) =>
  useQuery({ queryKey: ['vault', scope], queryFn: () => api.get<Paged<VaultEntry>>(`/vault/${scope}`) });

export function useVaultMutations(scope: VaultScope) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['vault', scope] });
  return {
    create: useMutation({
      mutationFn: (body: {
        title: string;
        username?: string;
        url?: string;
        notes?: string;
        category?: string;
        scope: VaultScope;
        secret?: string;
      }) => api.post<VaultEntry>('/vault', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...body
      }: {
        id: string;
        title?: string;
        username?: string;
        url?: string;
        notes?: string;
        category?: string;
        secret?: string;
      }) => api.put<VaultEntry>(`/vault/${scope}/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del<void>(`/vault/${scope}/${id}`),
      onSuccess: invalidate,
    }),
  };
}
