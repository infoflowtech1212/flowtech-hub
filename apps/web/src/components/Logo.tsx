/**
 * FlowTech "fT" monogram — grey f + teal T with the diagonal cut between them.
 * Kept as inline SVG so it renders under the strict CSP and scales crisply.
 * To swap in the official asset, replace this markup (and public/favicon.svg).
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="FlowTech"
    >
      {/* f — hook, crossbar, stem */}
      <path d="M4 18v-4a10 10 0 0 1 10-10h18l-8 14H4z" fill="#8C8C8C" />
      <rect x="2" y="24" width="24" height="10" fill="#8C8C8C" />
      <rect x="12" y="24" width="12" height="36" fill="#8C8C8C" />
      {/* T — top bar (diagonal left edge) + stem */}
      <path d="M34 4h26v14H26z" fill="#12A2B3" />
      <rect x="34" y="18" width="13" height="42" fill="#12A2B3" />
    </svg>
  );
}
