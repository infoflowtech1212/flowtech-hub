import { useEffect, useState } from 'react';
import { Briefcase, Building2, Mail, MapPin, Phone } from 'lucide-react';
import { useMe, useMyProfile, useSaveMyProfile, usePersonChart } from '@/hooks/useApi';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/states';

/**
 * Self-service profile — the signed-in user completes the fields Microsoft
 * doesn't hold (LinkedIn, working hours, bio) plus optional DOB / joining date.
 * Everything else is read-only and comes from Microsoft.
 */
export default function MyProfile() {
  const { data: me } = useMe();
  const chart = usePersonChart(me?.id ?? null);
  const profile = useMyProfile();
  const save = useSaveMyProfile();
  const person = chart.data?.person;

  const [form, setForm] = useState({ linkedIn: '', workingHours: '', bio: '', birthday: '', hireDate: '' });
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (profile.data)
      setForm({
        linkedIn: profile.data.linkedIn ?? '',
        workingHours: profile.data.workingHours ?? '',
        bio: profile.data.bio ?? '',
        birthday: profile.data.birthday ?? '',
        hireDate: profile.data.hireDate ?? '',
      });
  }, [profile.data]);

  async function submit() {
    setSaved(false);
    await save.mutateAsync(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Profile" subtitle="Complete your profile — it appears on the Organisation page." />

      {/* Microsoft-sourced summary (read-only) */}
      <SectionCard className="mb-4">
        <div className="flex items-center gap-4">
          <Avatar name={me?.displayName ?? '—'} src="/api/me/photo" size={64} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-content">{me?.displayName}</p>
            <p className="text-sm text-muted">{me?.jobTitle}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {me?.mail && <ReadRow icon={<Mail className="h-4 w-4" />}>{me.mail}</ReadRow>}
          {person?.mobilePhone && <ReadRow icon={<Phone className="h-4 w-4" />}>{person.mobilePhone}</ReadRow>}
          {me?.jobTitle && <ReadRow icon={<Briefcase className="h-4 w-4" />}>{me.jobTitle}</ReadRow>}
          {me?.department && <ReadRow icon={<Building2 className="h-4 w-4" />}>{me.department}</ReadRow>}
          {person?.officeLocation && <ReadRow icon={<MapPin className="h-4 w-4" />}>{person.officeLocation}</ReadRow>}
        </div>
        <p className="mt-3 text-xs text-subtle">These come from Microsoft 365 — ask an admin to change them.</p>
      </SectionCard>

      {/* Editable supplement */}
      <SectionCard title="About you">
        {profile.isLoading ? (
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
              <Field label="Date of birth">
                <input type="date" className="ft-input" value={form.birthday} onChange={(e) => set({ birthday: e.target.value })} />
              </Field>
              <Field label="Joining date">
                <input type="date" className="ft-input" value={form.hireDate} onChange={(e) => set({ hireDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Bio">
              <textarea className="ft-input min-h-[90px]" placeholder="A short intro about you…" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
            </Field>
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-xs text-success">Saved</span>}
              <button className="ft-btn-primary" onClick={submit} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ReadRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-content">
      <span className="text-muted">{icon}</span>
      <span className="truncate">{children}</span>
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
