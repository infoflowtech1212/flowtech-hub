import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { Capability } from '@flowtech/shared';
import { useCan } from '@/hooks/useCan';

/**
 * Route guard — renders children only if the user holds the capability. The BFF
 * still enforces authoritatively; this is for a clean UX on direct navigation.
 */
export function RequireCap({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { can } = useCan();
  if (can(capability)) return <>{children}</>;
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-line/5 text-muted">
        <Lock className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-bold">You don't have access to this area</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Your current roles don't include this capability. Ask a FlowTech Hub admin to grant access.
      </p>
      <Link to="/" className="ft-btn-ghost mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}
