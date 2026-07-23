import { clsx } from 'clsx';
import { Logo } from './Logo';

/**
 * FLOWTECH lockup — the fT monogram plus the wordmark, matching the
 * marketing site. Uppercase, tight tracking.
 */
export function Wordmark({ className, showHub = true }: { className?: string; showHub?: boolean }) {
  return (
    <span className={clsx('inline-flex select-none items-center gap-2', className)}>
      <Logo size={26} />
      <span className="text-[15px] font-extrabold uppercase tracking-[0.14em] text-content">
        Flow<span className="text-accent-bright">tech</span>
      </span>
      {showHub && (
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Hub</span>
      )}
    </span>
  );
}
