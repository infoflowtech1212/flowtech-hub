import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Expense, ExpenseCategory, ExpenseRecurrence, ExpenseStatus } from '@flowtech/shared';
import { useExpenses, useExpenseMutations } from '@/hooks/useIntranet';
import { useCan } from '@/hooks/useCan';
import { PageHeader, SectionCard } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';

const categoryLabel: Record<ExpenseCategory, string> = {
  software: 'Software',
  subscription: 'Subscription',
  hardware: 'Hardware',
  resource: 'Resource',
  service: 'Service',
  other: 'Other',
};
const statusTone: Record<ExpenseStatus, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  pending: 'warning',
  cancelled: 'neutral',
};
/** Monthly-equivalent so recurring costs are comparable in the summary. */
const monthlyFactor: Record<ExpenseRecurrence, number> = {
  'one-time': 0,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

export default function Expenses() {
  const { data, isLoading, isError, refetch } = useExpenses();
  const { can } = useCan();
  const { remove } = useExpenseMutations();
  const canManage = can('expenses.manage');
  const [showForm, setShowForm] = useState(false);

  const summary = useMemo(() => {
    const items = data?.items ?? [];
    const byCurrency = new Map<string, number>();
    let oneTime = 0;
    for (const e of items) {
      if (e.status === 'cancelled') continue;
      const monthly = e.amount * monthlyFactor[e.recurrence];
      if (monthly > 0) byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + monthly);
      else oneTime += 0; // one-time excluded from recurring run-rate
    }
    return { byCurrency, count: items.length, oneTime };
  }, [data]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Expenses"
        subtitle="Software, subscriptions, hardware and resource spend."
        actions={
          canManage && (
            <button className="ft-btn-primary" onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> Add expense
            </button>
          )
        }
      />

      {/* Monthly run-rate summary */}
      {!!summary.byCurrency.size && (
        <div className="mb-4 flex flex-wrap gap-3">
          {[...summary.byCurrency.entries()].map(([currency, monthly]) => (
            <SectionCard key={currency} className="flex-1 min-w-[180px]">
              <p className="text-xs uppercase tracking-wide text-muted">Monthly run-rate ({currency})</p>
              <p className="mt-1 text-2xl font-bold text-content">{money(monthly, currency)}</p>
              <p className="text-xs text-subtle">≈ {money(monthly * 12, currency)} / year</p>
            </SectionCard>
          ))}
        </div>
      )}

      {showForm && canManage && <ExpenseForm onDone={() => setShowForm(false)} />}

      <SectionCard title={`${summary.count} tracked ${summary.count === 1 ? 'line' : 'lines'}`}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState title="No expenses yet" hint="Add your first software or resource cost." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line/10 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Cadence</th>
                  <th className="py-2 pr-3 font-medium">Renewal</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  {canManage && <th className="py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/5">
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-content">{e.item}</p>
                      {e.vendor && <p className="text-xs text-subtle">{e.vendor}</p>}
                    </td>
                    <td className="py-2.5 pr-3"><Badge>{categoryLabel[e.category]}</Badge></td>
                    <td className="py-2.5 pr-3 text-muted">{e.owner ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-content">{money(e.amount, e.currency)}</td>
                    <td className="py-2.5 pr-3 text-muted">{e.recurrence}</td>
                    <td className="py-2.5 pr-3 text-muted">{e.renewalDate ? formatDate(e.renewalDate) : '—'}</td>
                    <td className="py-2.5 pr-3"><Badge tone={statusTone[e.status]}>{e.status}</Badge></td>
                    {canManage && (
                      <td className="py-2.5 text-right">
                        <button
                          className="ft-btn-ghost px-2 py-1"
                          title="Delete"
                          onClick={() => remove.mutate(e.id)}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

type FormState = Omit<Expense, 'id' | 'createdDateTime' | 'updatedDateTime'>;

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { create } = useExpenseMutations();
  const [form, setForm] = useState<FormState>({
    item: '',
    category: 'software',
    vendor: '',
    amount: 0,
    currency: 'USD',
    recurrence: 'monthly',
    status: 'active',
    owner: '',
    renewalDate: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    if (form.item.trim().length < 1) return setError('Item name is required.');
    if (!(form.amount >= 0)) return setError('Amount must be a number.');
    try {
      await create.mutateAsync({
        ...form,
        vendor: form.vendor || undefined,
        owner: form.owner || undefined,
        renewalDate: form.renewalDate || undefined,
        notes: form.notes || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SectionCard className="mb-4" title="Add expense">
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="ft-input" placeholder="Item (e.g. Figma)" value={form.item} onChange={(e) => set({ item: e.target.value })} />
        <input className="ft-input" placeholder="Vendor (optional)" value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} />
        <select className="ft-input" value={form.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory })}>
          <option value="software">Software</option>
          <option value="subscription">Subscription</option>
          <option value="hardware">Hardware</option>
          <option value="resource">Resource</option>
          <option value="service">Service</option>
          <option value="other">Other</option>
        </select>
        <input className="ft-input" placeholder="Owner / team (optional)" value={form.owner} onChange={(e) => set({ owner: e.target.value })} />
        <div className="flex gap-2">
          <input
            className="ft-input flex-1"
            type="number"
            min={0}
            step="0.01"
            placeholder="Amount"
            value={form.amount || ''}
            onChange={(e) => set({ amount: Number(e.target.value) })}
          />
          <input
            className="ft-input w-24"
            placeholder="USD"
            value={form.currency}
            onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 8) })}
          />
        </div>
        <select className="ft-input" value={form.recurrence} onChange={(e) => set({ recurrence: e.target.value as ExpenseRecurrence })}>
          <option value="one-time">One-time</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
        <select className="ft-input" value={form.status} onChange={(e) => set({ status: e.target.value as ExpenseStatus })}>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          Renewal
          <input
            className="ft-input flex-1"
            type="date"
            value={form.renewalDate}
            onChange={(e) => set({ renewalDate: e.target.value })}
          />
        </label>
      </div>
      <textarea
        className="ft-input mt-3 min-h-[60px]"
        placeholder="Notes (optional)"
        value={form.notes ?? ''}
        onChange={(e) => set({ notes: e.target.value })}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button className="ft-btn-ghost" onClick={onDone}>Cancel</button>
        <button className="ft-btn-primary" onClick={save} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add expense'}
        </button>
      </div>
    </SectionCard>
  );
}
