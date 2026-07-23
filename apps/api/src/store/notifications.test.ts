import { describe, expect, it } from 'vitest';
import { listNotifications, markAllRead, markRead, pushNotification, unreadCount } from './notifications.js';

describe('notifications store', () => {
  const user = 'user-notify';

  it('pushes unread notifications and counts them', () => {
    pushNotification(user, { title: 'A', kind: 'approval' });
    pushNotification(user, { title: 'B', kind: 'announcement' });
    expect(unreadCount(user)).toBe(2);
    // Newest first, unread ahead of read.
    expect(listNotifications(user)[0].title).toBe('B');
  });

  it('marks a single notification read', () => {
    const n = pushNotification(user, { title: 'C', kind: 'system' });
    expect(markRead(user, n.id)).toBe(true);
    expect(listNotifications(user).find((x) => x.id === n.id)?.read).toBe(true);
  });

  it('marks all read and zeroes the unread count', () => {
    pushNotification(user, { title: 'D', kind: 'mention' });
    expect(unreadCount(user)).toBeGreaterThan(0);
    markAllRead(user);
    expect(unreadCount(user)).toBe(0);
  });
});
