import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';

/**
 * Write a help-desk ticket into Dataverse as the app's application user. A
 * Dataverse-triggered Power Automate flow emails info@flowtechapps.com on new
 * rows. Enabled only when DATAVERSE_TICKET_TABLE is set (the table's entity set
 * name, plural), so the form still works before the table exists.
 */
const TABLE = process.env.DATAVERSE_TICKET_TABLE || ''; // e.g. cre2b_tickets
const P = process.env.DATAVERSE_TICKET_PREFIX || 'cre2b_';

export const ticketDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

export async function dvCreateTicket(t: {
  subject: string;
  description?: string;
  category: string;
  priority: string;
  status: string;
  requesterName: string;
  submitterEmail?: string;
  source: string;
}): Promise<void> {
  const token = await acquireDataverseAppToken();
  const base = `${config.dataverse.url.replace(/\/$/, '')}/api/data/v9.2`;
  const row: Record<string, unknown> = {
    [`${P}subject`]: t.subject,
    [`${P}description`]: t.description,
    [`${P}category`]: t.category,
    [`${P}priority`]: t.priority,
    [`${P}status`]: t.status,
    [`${P}requestername`]: t.requesterName,
    [`${P}submitteremail`]: t.submitterEmail,
    [`${P}source`]: t.source,
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
  logger.info({ subject: t.subject, source: t.source }, 'ticket written to Dataverse');
}
