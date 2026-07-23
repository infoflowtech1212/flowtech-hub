import { useEffect, useState } from 'react';
import { initials } from '@/lib/format';

/**
 * Avatar with graceful fallback to initials. Photo URLs are always BFF-proxied
 * (never a raw Graph URL). If the photo is missing (404) or fails to load, we
 * fall back to the initials monogram.
 */
export function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string;
  size?: number;
}) {
  const dim = { width: size, height: size };
  const [failed, setFailed] = useState(false);
  // Reset when the source changes (e.g. switching people).
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        style={dim}
        loading="lazy"
        onError={() => setFailed(true)}
        className="rounded-full object-cover ring-1 ring-line/10"
      />
    );
  }
  return (
    <div
      style={dim}
      aria-hidden
      className="flex select-none items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent-bright ring-1 ring-accent/20"
    >
      {initials(name)}
    </div>
  );
}
