import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { acquireDataverseAppToken } from '../auth/tokens.js';

/**
 * Mirror an admin note into Dataverse as the app's application user. Enabled
 * only when DATAVERSE_NOTE_TABLE is set (the table's plural entity-set name).
 * Notes are admin-only; keep the Dataverse table's security role restricted.
 */
const TABLE = process.env.DATAVERSE_NOTE_TABLE || ''; // e.g. cre2b_adminnotes
const P = process.env.DATAVERSE_NOTE_PREFIX || 'cre2b_';

export const noteDataverseEnabled = (): boolean => Boolean(config.dataverse.url && TABLE);

export async function dvCreateNote(n: {
  title: string;
  body: string;
  authorName: string;
}): Promise<void> {
  const token = await acquireDataverseAppToken();
  const base = `${config.dataverse.url.replace(/\/$/, '')}/api/data/v9.2`;
  const row: Record<string, unknown> = {
    [`${P}title`]: n.title,
    [`${P}body`]: n.body,
    [`${P}authorname`]: n.authorName,
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
  logger.info({ title: n.title }, 'admin note written to Dataverse');
}
