import { randomUUID } from 'node:crypto';
import type { Asset } from '@flowtech/shared';
import { mockAssets } from '../mocks.js';

/**
 * Mutable in-memory asset inventory (dev / mock), echoing the QR Trax product.
 * TODO(prod): back with a Dataverse `flowtech_asset` table.
 */
let assets: Asset[] = mockAssets.map((a) => ({ ...a }));

export const listAssets = (): Asset[] => [...assets].sort((a, b) => a.tag.localeCompare(b.tag));

export function createAsset(input: Omit<Asset, 'id'>): Asset {
  const asset: Asset = { id: `as-${randomUUID().slice(0, 8)}`, ...input };
  assets.unshift(asset);
  return asset;
}

export function updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Asset | undefined {
  const asset = assets.find((a) => a.id === id);
  if (!asset) return undefined;
  Object.assign(asset, patch);
  return { ...asset };
}

export function deleteAsset(id: string): boolean {
  const before = assets.length;
  assets = assets.filter((a) => a.id !== id);
  return assets.length < before;
}
