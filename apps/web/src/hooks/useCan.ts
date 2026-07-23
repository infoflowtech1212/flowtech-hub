import type { Capability } from '@flowtech/shared';
import { useMe } from './useApi';

/**
 * Client-side capability checks for adaptive UI. The BFF is the authority —
 * this only decides what to show/hide/disable, never what's allowed.
 */
export function useCan() {
  const { data } = useMe();
  const caps = data?.capabilities ?? [];
  return {
    capabilities: caps,
    can: (c: Capability) => caps.includes(c),
    canAny: (...cs: Capability[]) => cs.some((c) => caps.includes(c)),
    canAll: (...cs: Capability[]) => cs.every((c) => caps.includes(c)),
  };
}
