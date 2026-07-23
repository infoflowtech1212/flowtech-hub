import { useState } from 'react';

/**
 * App/quick-link icon: shows the site's real favicon (served through the BFF
 * proxy so it works under the strict CSP) and falls back to a colored monogram
 * when the link has no URL or the icon can't be loaded.
 */
const COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
];

function hostOf(url?: string): string | null {
  if (!url || url === '#') return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

function colorFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function AppLinkIcon({ label, url, logo }: { label: string; url?: string; logo?: string }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  const base = 'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg';

  // 1) An admin-set logo wins.
  if (logo && !failed) {
    return (
      <div className={`${base} border border-line/10 bg-white`}>
        <img src={logo} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      </div>
    );
  }

  // 2) Otherwise the site favicon (via proxy).
  if (host && !failed) {
    return (
      <div className={`${base} border border-line/10 bg-white`}>
        <img
          src={`/api/quicklinks/icon?host=${encodeURIComponent(host)}`}
          alt=""
          className="h-5 w-5"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  const letter = label.trim()[0]?.toUpperCase() ?? '#';
  return <div className={`${base} text-sm font-semibold text-white ${colorFor(label)}`}>{letter}</div>;
}
