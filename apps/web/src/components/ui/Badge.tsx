import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import type { RequestStatus } from '@flowtech/shared';

const tones = {
  neutral: 'bg-line/8 text-muted',
  accent: 'bg-accent/15 text-accent-bright',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<RequestStatus, keyof typeof tones> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={statusTone[status]}>{status}</Badge>;
}
