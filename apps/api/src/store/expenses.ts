import { randomUUID } from 'node:crypto';
import type { Expense } from '@flowtech/shared';

/**
 * Company expense tracker (dev/mock) — software subscriptions, hardware,
 * resources and services. TODO(prod): text data mirrors to a Dataverse
 * `flowtech_expense` table (see ../dataverse/expenses.ts).
 */
let expenses: Expense[] = [
  {
    id: 'ex-001',
    item: 'Microsoft 365 Business Premium',
    category: 'subscription',
    vendor: 'Microsoft',
    amount: 22,
    currency: 'USD',
    recurrence: 'monthly',
    status: 'active',
    owner: 'IT',
    renewalDate: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10),
    notes: 'Per-user licence.',
    createdDateTime: new Date(Date.now() - 60 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 60 * 864e5).toISOString(),
  },
  {
    id: 'ex-002',
    item: 'Figma Organization',
    category: 'software',
    vendor: 'Figma',
    amount: 45,
    currency: 'USD',
    recurrence: 'monthly',
    status: 'active',
    owner: 'Design',
    createdDateTime: new Date(Date.now() - 40 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 40 * 864e5).toISOString(),
  },
  {
    id: 'ex-003',
    item: 'MacBook Pro 14"',
    category: 'hardware',
    vendor: 'Apple',
    amount: 1999,
    currency: 'USD',
    recurrence: 'one-time',
    status: 'active',
    owner: 'Engineering',
    createdDateTime: new Date(Date.now() - 15 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 15 * 864e5).toISOString(),
  },
];

const byUpdatedDesc = (a: Expense, b: Expense) =>
  new Date(b.updatedDateTime).getTime() - new Date(a.updatedDateTime).getTime();

export const listExpenses = (): Expense[] => [...expenses].sort(byUpdatedDesc);

export function createExpense(input: Omit<Expense, 'id' | 'createdDateTime' | 'updatedDateTime'>): Expense {
  const now = new Date().toISOString();
  const expense: Expense = {
    id: `ex-${randomUUID().slice(0, 8)}`,
    createdDateTime: now,
    updatedDateTime: now,
    ...input,
  };
  expenses.unshift(expense);
  return expense;
}

export function updateExpense(id: string, patch: Partial<Omit<Expense, 'id' | 'createdDateTime'>>): Expense | undefined {
  const expense = expenses.find((e) => e.id === id);
  if (!expense) return undefined;
  Object.assign(expense, patch, { updatedDateTime: new Date().toISOString() });
  return { ...expense };
}

export function deleteExpense(id: string): boolean {
  const before = expenses.length;
  expenses = expenses.filter((e) => e.id !== id);
  return expenses.length < before;
}
