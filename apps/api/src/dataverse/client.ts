import axios, { type AxiosInstance } from 'axios';
import { config } from '../config.js';

/**
 * Dataverse Web API (OData v4) client, authenticated with a delegated token
 * acquired On-Behalf-Of the signed-in user (so row-level security applies).
 * Tokens never reach the browser.
 */
export function dataverseClientFor(getToken: () => Promise<string>): AxiosInstance {
  if (!config.dataverse.url) {
    throw new Error('Dataverse not configured — set DATAVERSE_URL / DATAVERSE_SCOPE in .env');
  }
  const instance = axios.create({
    baseURL: `${config.dataverse.url.replace(/\/$/, '')}/api/data/v9.2`,
    headers: {
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      Prefer: 'return=representation',
    },
  });

  instance.interceptors.request.use(async (cfg) => {
    const token = await getToken();
    cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });

  return instance;
}
