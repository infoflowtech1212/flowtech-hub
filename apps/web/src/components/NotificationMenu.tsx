import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '@/hooks/useApi';
import { relativeDate } from '@/lib/format';

/**
 * Bell + dropdown notification center. Live unread badge (light polling), a
 * scrollable list, per-item mark-as-read, and mark-all-read. Works in either
 * shell (employee or admin).
 */
export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-muted hover:bg-line/5 hover:text-content"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 animate-fade-up overflow-hidden rounded-card border border-line/10 bg-elevated shadow-card"
        >
          <div className="flex items-center justify-between border-b border-line/10 px-4 py-2.5">
            <p className="text-sm font-semibold text-content">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1 text-xs text-accent-bright hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!items.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
            ) : (
              <ul className="divide-y divide-line/5">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => !n.read && markRead.mutate(n.id)}
                      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-line/5 ${n.read ? '' : 'bg-accent/5'}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-accent'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-content">{n.title}</span>
                        {n.body && <span className="mt-0.5 block line-clamp-2 text-xs text-muted">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-subtle">{relativeDate(n.createdDateTime)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
