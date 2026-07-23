import { motion } from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';
import { login } from '@/lib/auth';
import { Logo } from '@/components/Logo';

/**
 * Landing / sign-in page for unauthenticated visitors. Deliberately reveals
 * nothing about what's inside the portal — just brand, tagline, and sign-in.
 */
export default function SignIn({ error }: { error?: string }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#070d10] text-white">
      {/* Animated brand glows */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(15,124,138,0.9), transparent 60%)' }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-40 h-[40rem] w-[40rem] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(47,212,230,0.8), transparent 60%)' }}
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Faint grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)',
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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tightest sm:text-6xl">
            Flow<span className="bg-gradient-to-r from-accent to-accent-bright bg-clip-text text-transparent">tech</span> Hub
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg text-white/70">
            Strategy first.{' '}
            <span className="bg-gradient-to-r from-accent to-accent-bright bg-clip-text font-semibold text-transparent">
              Systems that follow.
            </span>
          </p>

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
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="group mx-auto mt-10 inline-flex items-center gap-2 rounded-pill bg-accent px-7 py-3 text-base font-semibold text-white shadow-[0_10px_40px_-10px_rgba(15,124,138,0.7)] transition-colors hover:bg-accent-bright hover:text-[#070d10]"
          >
            Sign in with Microsoft
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </motion.button>
          <p className="mt-4 text-xs text-white/40">Authorised FlowTech accounts only.</p>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 text-center text-[11px] text-white/30">
        © {new Date().getFullYear()} FlowTech Apps · Internal use only
      </footer>
    </div>
  );
}
