import { useEffect, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import type { RoleAssignment } from '@flowtech/shared';
import { usePeopleAccess, useProfileSupplement, useSaveProfile } from '@/hooks/useAdmin';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

/**
 * Admin editor for the Hub-managed profile supplement (LinkedIn, working hours,
 * bio, and DOB / joining-date overrides). Everything else on the Organisation
 * card comes from Microsoft automatically.
 */
export default function AdminProfiles() {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const people = usePeopleAccess(debounced);
  const [selected, setSelected] = useState<RoleAssignment | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Employee Profiles"
        subtitle="Add LinkedIn, working hours, bio, and DOB/joining overrides — shown on the Organisation card."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* People list */}
        <SectionCard>
          <div className="mb-3 flex items-center gap-2 rounded-pill border border-line/10 bg-surface-deep px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="w-full bg-transparent text-sm text-content placeholder:text-subtle focus:outline-none"
            />
          </div>
          {people.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : people.isError ? (
            <ErrorState onRetry={() => people.refetch()} />
          ) : !people.data?.items.length ? (
            <EmptyState title="No people" />
          ) : (
            <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
              {people.data.items.map((p) => (
                <li key={p.userId}>
                  <button
                    onClick={() => setSelected(p)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-line/5 ${
                      selected?.userId === p.userId ? 'bg-accent/10' : ''
                    }`}
                  >
                    <Avatar name={p.displayName} src={`/api/directory/${p.userId}/photo`} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content">{p.displayName}</p>
                      <p className="truncate text-xs text-subtle">{p.jobTitle ?? p.mail}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Editor */}
        {selected ? (
          <ProfileEditor key={selected.userId} person={selected} />
        ) : (
          <SectionCard>
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
              <UserRound className="h-6 w-6" />
              <p className="text-sm">Select a person to edit their profile extras.</p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function ProfileEditor({ person }: { person: RoleAssignment }) {
  const { data, isLoading } = useProfileSupplement(person.userId);
  const save = useSaveProfile();
  const [form, setForm] = useState({ linkedIn: '', workingHours: '', bio: '', birthday: '', hireDate: '' });
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (data) setForm({
      linkedIn: data.linkedIn ?? '',
      workingHours: data.workingHours ?? '',
      bio: data.bio ?? '',
      birthday: data.birthday ?? '',
      hireDate: data.hireDate ?? '',
    });
  }, [data]);

  async function submit() {
    setSaved(false);
    await save.mutateAsync({ userId: person.userId, ...form });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <SectionCard title={person.displayName}>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-3">
          <Field label="LinkedIn URL">
            <input className="ft-input" placeholder="https://linkedin.com/in/…" value={form.linkedIn} onChange={(e) => set({ linkedIn: e.target.value })} />
          </Field>
          <Field label="Working hours">
            <input className="ft-input" placeholder="Mon–Fri, 9:00–18:00 IST" value={form.workingHours} onChange={(e) => set({ workingHours: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth (override)">
              <input type="date" className="ft-input" value={form.birthday} onChange={(e) => set({ birthday: e.target.value })} />
            </Field>
            <Field label="Joining date (override)">
              <input type="date" className="ft-input" value={form.hireDate} onChange={(e) => set({ hireDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Bio">
            <textarea className="ft-input min-h-[80px]" placeholder="Short bio…" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
          </Field>
          <p className="text-xs text-subtle">
            DOB and joining date are only used when Microsoft has none. Email, mobile, position, location,
            manager and photo always come from Microsoft.
          </p>
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-success">Saved</span>}
            <button className="ft-btn-primary" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
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
