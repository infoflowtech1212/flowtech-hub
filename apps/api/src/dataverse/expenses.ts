import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';

/**
 * Mirror an expense line into Dataverse as the app's application user. Enabled
 * only when DATAVERSE_EXPENSE_TABLE is set (the table's plural entity-set name),
 * so the tracker works in-app before the table exists. Follows the proven
 * text→Dataverse pattern used by the vault + tickets.
 */
const TABLE = process.env.DATAVERSE_EXPENSE_TABLE || ''; // e.g. cre2b_expenses
const P = process.env.DATAVERSE_EXPENSE_PREFIX || 'cre2b_';

export const expenseDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

export async function dvCreateExpense(e: {
  item: string;
  category: string;
  vendor?: string;
  amount: number;
  currency: string;
  recurrence: string;
  status: string;
  owner?: string;
  renewalDate?: string;
  notes?: string;
}): Promise<void> {
  const token = await acquireDataverseAppToken();
  const base = `${config.dataverse.url.replace(/\/$/, '')}/api/data/v9.2`;
  const row: Record<string, unknown> = {
    [`${P}item`]: e.item,
    [`${P}category`]: e.category,
    [`${P}vendor`]: e.vendor,
    [`${P}amount`]: e.amount,
    [`${P}currency`]: e.currency,
    [`${P}recurrence`]: e.recurrence,
    [`${P}status`]: e.status,
    [`${P}owner`]: e.owner,
    [`${P}renewaldate`]: e.renewalDate,
    [`${P}notes`]: e.notes,
  };
  await axios.post(`${base}/${TABLE}`, row, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
    timeout: 10_000,
  });
  logger.info({ item: e.item, category: e.category }, 'expense written to Dataverse');
}
