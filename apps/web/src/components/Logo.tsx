/**
 * FlowTech logo — the official mark from flowtechapps.com, served from
 * /public/logo.png (self-hosted, so it renders under the strict CSP).
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt="FlowTech"
      className={className}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
