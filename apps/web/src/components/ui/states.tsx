import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

/** Reusable loading skeleton block. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`ft-skeleton ${className}`} aria-hidden />;
}

/** Empty state — clean, minimal, on-brand. */
export function EmptyState({
  icon = <Inbox className="h-5 w-5" />,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-line/5 text-muted">
        {icon}
      </div>
      <p className="text-sm font-medium text-content">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Error state with retry. Used inside widget error boundaries and queries. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted">{message ?? 'Something went wrong loading this.'}</p>
      {onRetry && (
        <button className="ft-btn-ghost" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}
