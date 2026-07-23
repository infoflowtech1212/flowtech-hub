import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Send } from 'lucide-react';
import { Logo } from '@/components/Logo';

/**
 * Public, shareable request form — no sign-in required. Submissions create a
 * help-desk ticket and notify info@flowtechapps.com. Reachable at /submit.
 */
export default function PublicForm() {
  const [form, setForm] = useState({ name: '', email: '', category: 'General', subject: '', message: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim() || form.subject.trim().length < 2 || !form.message.trim()) {
      return setError('Please fill in your name, email, a subject, and a message.');
    }
    setState('sending');
    try {
      const res = await fetch('/public/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? 'Submission failed');
      }
      setState('done');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-ink text-content">
      <header className="flex items-center gap-2.5 border-b border-line/10 px-6 py-5">
        <Logo size={28} />
        <span className="text-[15px] font-extrabold uppercase tracking-[0.14em]">
          Flow<span className="text-accent-bright">tech</span>
        </span>
      </header>

      <main className="mx-auto max-w-lg px-6 py-12">
        {state === 'done' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="ft-card p-8 text-center"
          >
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-4 text-xl font-bold">Thanks — we've got it.</h1>
            <p className="mt-2 text-sm text-muted">
              Your request has been logged and the FlowTech team has been notified. We'll be in touch
              at <span className="text-content">{form.email}</span>.
            </p>
            <button
              className="ft-btn-ghost mt-6"
              onClick={() => {
                setForm({ name: '', email: '', category: 'General', subject: '', message: '' });
                setState('idle');
              }}
            >
              Submit another
            </button>
          </motion.div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tightest">Contact FlowTech</h1>
            <p className="mt-1 text-sm text-muted">
              Send us a request or question — we'll create a ticket and get back to you.
            </p>

            <form onSubmit={submit} className="ft-card mt-6 space-y-4 p-6">
              {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Your name">
                  <input className="ft-input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input type="email" className="ft-input" value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
              </div>
              <Field label="Category">
                <select className="ft-input" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                  <option>General</option>
                  <option>Support</option>
                  <option>Sales</option>
                  <option>Billing</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Subject">
                <input className="ft-input" value={form.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Short summary" />
              </Field>
              <Field label="Message">
                <textarea className="ft-input min-h-[120px]" value={form.message} onChange={(e) => set({ message: e.target.value })} placeholder="How can we help?" />
              </Field>
              <button type="submit" className="ft-btn-primary w-full" disabled={state === 'sending'}>
                <Send className="h-4 w-4" /> {state === 'sending' ? 'Sending…' : 'Submit request'}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-xs text-subtle">Powered by FlowTech Hub</p>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
