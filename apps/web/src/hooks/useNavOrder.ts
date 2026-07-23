import { useCallback, useState } from 'react';
import type { NavGroup } from '@/config/nav';

/**
 * Persisted, user-adjustable sidebar order. Each group's items can be dragged to
 * reorder; the order (a list of item `to` paths per group) is saved to
 * localStorage so it sticks across sessions. New items not yet in the saved
 * order fall to the end.
 */
const KEY = 'ft-nav-order-v1';
type OrderMap = Record<string, string[]>;

export const groupKey = (g: { label?: string }, i: number) => g.label ?? `top-${i}`;

function load(): OrderMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function useNavOrder() {
  const [order, setOrder] = useState<OrderMap>(load);

  /** Apply the saved order to filtered groups. */
  const applyOrder = useCallback(
    (groups: NavGroup[]): NavGroup[] =>
      groups.map((g, i) => {
        const saved = order[groupKey(g, i)];
        if (!saved) return g;
        const rank = (to: string) => {
          const idx = saved.indexOf(to);
          return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
        };
        return { ...g, items: [...g.items].sort((a, b) => rank(a.to) - rank(b.to)) };
      }),
    [order],
  );

  /** Move `fromTo` to the position of `targetTo` within a group. */
  const reorder = useCallback((key: string, currentTos: string[], fromTo: string, targetTo: string) => {
    if (fromTo === targetTo) return;
    const next = [...currentTos];
    const from = next.indexOf(fromTo);
    const to = next.indexOf(targetTo);
    if (from === -1 || to === -1) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder((prev) => {
      const updated = { ...prev, [key]: next };
      try {
        localStorage.setItem(KEY, JSON.stringify(updated));
      } catch {
        /* storage unavailable */
      }
      return updated;
    });
  }, []);

  return { applyOrder, reorder };
}
