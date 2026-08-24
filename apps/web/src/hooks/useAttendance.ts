import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceDaySummary,
  AttendanceLiveEntry,
  AttendanceRecord,
  AttendanceToday,
  Paged,
} from '@flowtech/shared';
import { api } from '@/lib/api';

// --- Personal ----------------------------------------------------------
export const useAttendanceToday = () =>
  useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api.get<AttendanceToday>('/attendance/today'),
    refetchInterval: 60_000,
  });

export const useAttendanceHistory = (from: string, to: string) =>
  useQuery({
    queryKey: ['attendance', 'history', from, to],
    queryFn: () => api.get<Paged<AttendanceRecord>>(`/attendance?from=${from}&to=${to}`),
  });

export const useAttendanceCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: ['attendance', 'calendar', from, to],
    queryFn: () => api.get<{ items: AttendanceDaySummary[] }>(`/attendance/calendar?from=${from}&to=${to}`),
  });

export interface PunchOutInput {
  completedTasks: string[];
  tomorrowsPlan: string;
  blockers?: string;
}

export function useAttendancePunch() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['attendance'] });
  return {
    punchIn: useMutation({
      mutationFn: () => api.post<AttendanceRecord>('/attendance/punch-in'),
      onSuccess: invalidate,
    }),
    punchOut: useMutation({
      mutationFn: (eod: PunchOutInput) => api.post<AttendanceRecord>('/attendance/punch-out', eod),
      onSuccess: invalidate,
    }),
  };
}

// --- Admin (team-wide) ---------------------------------------------------
export const useAdminAttendanceToday = () =>
  useQuery({
    queryKey: ['admin', 'attendance', 'today'],
    queryFn: () => api.get<Paged<AttendanceLiveEntry>>('/admin/attendance/today'),
    refetchInterval: 30_000,
  });

export const useAdminAttendanceHistory = (from: string, to: string) =>
  useQuery({
    queryKey: ['admin', 'attendance', 'history', from, to],
    queryFn: () => api.get<Paged<AttendanceRecord>>(`/admin/attendance?from=${from}&to=${to}`),
  });
