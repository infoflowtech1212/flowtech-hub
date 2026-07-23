import { describe, expect, it } from 'vitest';
import { formatBytes, greeting, initials } from './format';

describe('format helpers', () => {
  it('initials takes up to two parts', () => {
    expect(initials('Alex Morgan')).toBe('AM');
    expect(initials('Priya')).toBe('P');
  });

  it('formatBytes scales units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(482_133)).toMatch(/KB$/);
    expect(formatBytes(undefined)).toBe('—');
  });

  it('greeting varies by hour', () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 20))).toBe('Good evening');
  });
});
