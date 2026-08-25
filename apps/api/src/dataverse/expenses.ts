import type { Expense, ExpenseCategory, ExpenseRecurrence, ExpenseStatus } from '@flowtech/shared';
import { config } from '../config.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';
import { dataverseClientFor } from './client.js';

/**
 * Live Dataverse persistence for the Expense tracker — a team-wide list (no
 * per-owner scoping; anyone with expenses.view sees every row). Written by
 * the app's own application user (client-credentials token), so no
 * per-employee Dataverse license is needed. Same pattern as dataverse/vault.ts.
 *
 * Column logical names follow the publisher prefix, individually overridable
 * since real table builds rarely match the P+suffix pattern exactly (see
 * data-table/expenses.csv for a ready-to-import template).
 *
 * Defaults below match the live `ft_expenseses` table (Power Platform admin
 * center → FlowTech - L+M Asset Transitions → Tables → Expenses → Columns).
 * That table has NO column for Owner or Notes — OWNER_COL/NOTES_COL are left
 * unset by default, and both fields are silently dropped on write (never
 * sent, never read back) until DATAVERSE_EXPENSE_OWNER_COL /
 * DATAVERSE_EXPENSE_NOTES_COL are set, once those columns exist.
 *
 * Enabled only when DATAVERSE_EXPENSE_TABLE is set; otherwise the app uses
 * the built-in in-memory store, which is lost on every redeploy.
 */
const TABLE = process.env.DATAVERSE_EXPENSE_TABLE || ''; // entity set (plural)
const P = process.env.DATAVERSE_EXPENSE_PREFIX || 'ft_';
const ID_COL = process.env.DATAVERSE_EXPENSE_ID_COL || `${P}expensesid`;
const ITEM_COL = process.env.DATAVERSE_EXPENSE_ITEM_COL || `${P}assetname`;
const CATEGORY_COL = process.env.DATAVERSE_EXPENSE_CATEGORY_COL || `${P}assetcategory`;
const VENDOR_COL = process.env.DATAVERSE_EXPENSE_VENDOR_COL || `${P}vendorname`;
const AMOUNT_COL = process.env.DATAVERSE_EXPENSE_AMOUNT_COL || `${P}purchaseamount`;
const CURRENCY_COL = process.env.DATAVERSE_EXPENSE_CURRENCY_COL || `${P}currencycode`;
const RECURRENCE_COL = process.env.DATAVERSE_EXPENSE_RECURRENCE_COL || `${P}paymentrecurrence`;
const STATUS_COL = process.env.DATAVERSE_EXPENSE_STATUS_COL || `${P}assetstatus`;
const RENEWALDATE_COL = process.env.DATAVERSE_EXPENSE_RENEWALDATE_COL || `${P}renewaldate`;
// No matching column on the live table — unset until one is added.
const OWNER_COL = process.env.DATAVERSE_EXPENSE_OWNER_COL || '';
const NOTES_COL = process.env.DATAVERSE_EXPENSE_NOTES_COL || '';

export const expenseDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

const client = () => dataverseClientFor(() => acquireDataverseAppToken());

interface DvRow {
  [key: string]: unknown;
}

const SELECT = `$select=${[
  ID_COL,
  ITEM_COL,
  CATEGORY_COL,
  VENDOR_COL,
  AMOUNT_COL,
  CURRENCY_COL,
  RECURRENCE_COL,
  STATUS_COL,
  RENEWALDATE_COL,
  ...(OWNER_COL ? [OWNER_COL] : []),
  ...(NOTES_COL ? [NOTES_COL] : []),
].join(',')},createdon,modifiedon`;

const toDto = (r: DvRow): Expense => ({
  id: r[ID_COL] as string,
  item: (r[ITEM_COL] as string) ?? '',
  category: ((r[CATEGORY_COL] as ExpenseCategory | null) ?? 'other') as ExpenseCategory,
  vendor: (r[VENDOR_COL] as string | null) ?? undefined,
  amount: (r[AMOUNT_COL] as number | null) ?? 0,
  currency: (r[CURRENCY_COL] as string) ?? 'USD',
  recurrence: ((r[RECURRENCE_COL] as ExpenseRecurrence | null) ?? 'one-time') as ExpenseRecurrence,
  status: ((r[STATUS_COL] as ExpenseStatus | null) ?? 'active') as ExpenseStatus,
  owner: (OWNER_COL ? (r[OWNER_COL] as string | null) : undefined) ?? undefined,
  renewalDate: (r[RENEWALDATE_COL] as string | null) ?? undefined,
  notes: (NOTES_COL ? (r[NOTES_COL] as string | null) : undefined) ?? undefined,
  createdDateTime: (r.createdon as string) ?? '',
  updatedDateTime: (r.modifiedon as string) ?? (r.createdon as string) ?? '',
});

export async function dvListExpenses(): Promise<Expense[]> {
  const { data } = await client().get(`/${TABLE}?${SELECT}&$orderby=modifiedon desc`);
  return (data.value as DvRow[]).map(toDto);
}

export async function dvCreateExpense(
  input: Omit<Expense, 'id' | 'createdDateTime' | 'updatedDateTime'>,
): Promise<Expense> {
  const row: Record<string, unknown> = {
    [ITEM_COL]: input.item,
    [CATEGORY_COL]: input.category,
    [VENDOR_COL]: input.vendor,
    [AMOUNT_COL]: input.amount,
    [CURRENCY_COL]: input.currency,
    [RECURRENCE_COL]: input.recurrence,
    [STATUS_COL]: input.status,
    [RENEWALDATE_COL]: input.renewalDate,
  };
  if (OWNER_COL) row[OWNER_COL] = input.owner;
  if (NOTES_COL) row[NOTES_COL] = input.notes;
  const { data } = await client().post(`/${TABLE}`, row);
  return toDto(data as DvRow);
}

/** Pre-check so a stale/missing id maps to a clean 404 at the route instead of a raw Dataverse error. */
async function assertExists(id: string): Promise<void> {
  const url = `/${TABLE}?$select=${ID_COL}&$filter=${ID_COL} eq ${id}&$top=1`;
  const { data } = await client().get(url);
  if (!(data.value as DvRow[])[0]) throw new Error('not_found');
}

export async function dvUpdateExpense(
  id: string,
  patch: Partial<Omit<Expense, 'id' | 'createdDateTime' | 'updatedDateTime'>>,
): Promise<Expense> {
  await assertExists(id);
  const row: Record<string, unknown> = {};
  if (patch.item !== undefined) row[ITEM_COL] = patch.item;
  if (patch.category !== undefined) row[CATEGORY_COL] = patch.category;
  if (patch.vendor !== undefined) row[VENDOR_COL] = patch.vendor;
  if (patch.amount !== undefined) row[AMOUNT_COL] = patch.amount;
  if (patch.currency !== undefined) row[CURRENCY_COL] = patch.currency;
  if (patch.recurrence !== undefined) row[RECURRENCE_COL] = patch.recurrence;
  if (patch.status !== undefined) row[STATUS_COL] = patch.status;
  if (patch.renewalDate !== undefined) row[RENEWALDATE_COL] = patch.renewalDate;
  if (OWNER_COL && patch.owner !== undefined) row[OWNER_COL] = patch.owner;
  if (NOTES_COL && patch.notes !== undefined) row[NOTES_COL] = patch.notes;
  const { data } = await client().patch(`/${TABLE}(${id})`, row);
  return toDto(data as DvRow);
}

export async function dvDeleteExpense(id: string): Promise<void> {
  await assertExists(id);
  await client().delete(`/${TABLE}(${id})`);
}
