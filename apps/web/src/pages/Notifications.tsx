import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import type { Notification } from '@flowtech/shared';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useApi';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { relativeDate } from '@/lib/format';

export default function Notifications() {
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const onOpen = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        subtitle="Approval outcomes, mentions, and announcements."
        actions={
          (data?.unread ?? 0) > 0 && (
            <button className="ft-btn-ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          )
        }
      />
      <SectionCard>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState icon={<BellOff className="h-5 w-5" />} title="You're all caught up" />
        ) : (
          <ul className="divide-y divide-line/5">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onOpen(n)}
                  className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-line/5"
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      n.read ? 'bg-line/5 text-muted' : 'bg-accent/15 text-accent-bright'
                    }`}
                  >
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'font-medium text-content' : 'font-semibold text-content'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-xs text-muted">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-subtle">{relativeDate(n.createdDateTime)}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-bright" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
