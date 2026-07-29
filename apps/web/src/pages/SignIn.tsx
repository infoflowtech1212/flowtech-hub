import { useEffect, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';
import { login } from '@/lib/auth';
import { Logo } from '@/components/Logo';

const TAGLINES = [
  'Strategy first. Systems that follow.',
  'Real estate strategy, built & implemented.',
  'Where every operation flows as one.',
];

/**
 * Landing / sign-in page for unauthenticated visitors. Deliberately reveals
 * nothing about what's inside the portal — an animated brand experience plus
 * sign-in. Cursor-reactive glows, an orbiting "hub" emblem, rotating tagline.
 */
export default function SignIn({ error }: { error?: string }) {
  // Cursor parallax for the background glows.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 20 });
  const sy = useSpring(my, { stiffness: 40, damping: 20 });
  const glowAx = useTransform(sx, (v) => v * 50);
  const glowAy = useTransform(sy, (v) => v * 40);
  const glowBx = useTransform(sx, (v) => v * -40);
  const glowBy = useTransform(sy, (v) => v * -30);

  const [tag, setTag] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTag((t) => (t + 1) % TAGLINES.length), 3800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      onMouseMove={(e) => {
        mx.set(e.clientX / window.innerWidth - 0.5);
        my.set(e.clientY / window.innerHeight - 0.5);
      }}
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#060c0f] text-white"
    >
      {/* Cursor-reactive brand glows */}
      <motion.div
        aria-hidden
        style={{ x: glowAx, y: glowAy, background: 'radial-gradient(circle, rgba(15,124,138,0.9), transparent 60%)' }}
        className="pointer-events-none absolute -left-40 -top-40 h-[38rem] w-[38rem] rounded-full opacity-40 blur-3xl"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        style={{ x: glowBx, y: glowBy, background: 'radial-gradient(circle, rgba(47,212,230,0.8), transparent 60%)' }}
        className="pointer-events-none absolute -bottom-52 -right-40 h-[42rem] w-[42rem] rounded-full opacity-30 blur-3xl"
        animate={{ scale: [1, 1.12, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Faint grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 42%, black, transparent)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <span className="inline-flex select-none items-center gap-2.5">
          <Logo size={30} />
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-base font-extrabold uppercase tracking-[0.18em]">
              Flow<span className="text-accent-bright">tech</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">Hub</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-white/10 px-3 py-1 text-[11px] font-medium text-white/60">
          <Lock className="h-3 w-3" /> Private
        </span>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Orbiting hub emblem */}
        <HubEmblem />

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-10 text-5xl font-extrabold leading-[1.05] tracking-tightest sm:text-6xl"
        >
          Flow<span className="bg-gradient-to-r from-accent to-accent-bright bg-clip-text text-transparent">tech</span> Hub
        </motion.h1>

        {/* Rotating tagline */}
        <div className="mt-5 h-7 max-w-md">
          <AnimatePresence mode="wait">
            <motion.p
              key={tag}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="text-lg text-white/70"
            >
              {TAGLINES[tag]}
            </motion.p>
          </AnimatePresence>
        </div>

        {error && (
          <p className="mx-auto mt-6 max-w-sm rounded-lg bg-danger/15 px-4 py-2 text-sm text-danger">
            {error === 'domain'
              ? 'Access is limited to FlowTech accounts (@flowtechapps.com). Please sign in with your FlowTech email.'
              : error === 'state'
                ? 'Your sign-in session expired. Please try again.'
                : 'Sign-in was cancelled or failed. Please try again.'}
          </p>
        )}

        <motion.button
          onClick={() => login()}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="group mx-auto mt-10 inline-flex items-center gap-2 rounded-pill bg-accent px-7 py-3 text-base font-semibold text-white shadow-[0_10px_40px_-10px_rgba(15,124,138,0.7)] transition-colors hover:bg-accent-bright hover:text-[#060c0f]"
        >
          Sign in with Microsoft
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </motion.button>
        <p className="mt-4 text-xs text-white/40">Authorised FlowTech accounts only.</p>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 text-center text-[11px] text-white/30">
        © {new Date().getFullYear()} FlowTech Apps · Internal use only
      </footer>
    </div>
  );
}

/** The logo, framed by counter-rotating dashed rings, orbiting dots and a radar pulse. */
function HubEmblem() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="relative flex h-40 w-40 items-center justify-center"
    >
      {/* Radar pulse */}
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border border-accent-bright/40"
          initial={{ width: 72, height: 72, opacity: 0.5 }}
          animate={{ width: 176, height: 176, opacity: 0 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeOut', delay: i * 1.5 }}
        />
      ))}

      {/* Outer dashed ring (slow, clockwise) with an orbiting dot */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
      >
        <svg viewBox="0 0 160 160" className="h-full w-full">
          <circle cx="80" cy="80" r="76" fill="none" stroke="rgba(47,212,230,0.25)" strokeWidth="1" strokeDasharray="2 8" />
          <circle cx="80" cy="4" r="3.5" fill="rgb(47,212,230)" />
        </svg>
      </motion.div>

      {/* Inner ring (faster, counter-clockwise) with a dot */}
      <motion.div
        aria-hidden
        className="absolute inset-4"
        animate={{ rotate: -360 }}
        transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
      >
        <svg viewBox="0 0 128 128" className="h-full w-full">
          <circle cx="64" cy="64" r="60" fill="none" stroke="rgba(15,124,138,0.4)" strokeWidth="1.5" strokeDasharray="1 10" />
          <circle cx="64" cy="4" r="3" fill="rgb(15,124,138)" />
        </svg>
      </motion.div>

      {/* Glow + logo */}
      <div className="absolute h-24 w-24 rounded-full bg-accent/20 blur-2xl" />
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm"
      >
        <Logo size={44} />
      </motion.div>
    </motion.div>
  );
}
