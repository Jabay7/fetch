/**
 * Shopping-list grouping: organize saved products by aisle for the selected
 * store so a shopper can walk the store in order. Items whose location is
 * unknown sort last; items the store doesn't carry go to the very end.
 * Pure and provider-agnostic — resolution against the current store happens
 * in the Saved screen's query.
 */

import type { ProductDetails } from '@/data/types';
import type { SavedProduct } from '@/lib/saved-products';

export interface ShoppingListSection {
  /** Section headline, e.g. "Aisle G18", "Aisle unavailable", "Not carried". */
  title: string;
  /** Stable key for list rendering. */
  key: string;
  data: SavedProduct[];
}

const NO_AISLE_KEY = '__no_aisle__';
const NOT_CARRIED_KEY = '__not_carried__';

/**
 * Group saved items by resolved aisle. `resolved` maps product id →
 * ProductDetails (carried) or null (not carried); products missing from the
 * map (still loading) group under their save order in a single section.
 *
 * Aisle codes are opaque strings; they sort naturally ("2" < "12" < "G18").
 */
export function buildShoppingSections(
  saved: SavedProduct[],
  resolved: Map<string, ProductDetails | null> | undefined,
  aisleDataSupported: boolean
): ShoppingListSection[] {
  if (!resolved || !aisleDataSupported) {
    // No aisle grouping possible (loading, or a departments-only store):
    // one flat section keeps the list usable.
    return saved.length > 0 ? [{ title: '', key: 'all', data: saved }] : [];
  }

  const groups = new Map<string, SavedProduct[]>();
  for (const item of saved) {
    const details = resolved.get(item.id);
    const key =
      details === null
        ? NOT_CARRIED_KEY
        : details?.location?.aisle
          ? `aisle:${details.location.aisle}`
          : NO_AISLE_KEY;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const aisleKeys = [...groups.keys()]
    .filter((key) => key.startsWith('aisle:'))
    .sort((a, b) =>
      a.slice(6).localeCompare(b.slice(6), undefined, { numeric: true })
    );

  const sections: ShoppingListSection[] = aisleKeys.map((key) => ({
    key,
    title: `Aisle ${key.slice(6)}`,
    data: groups.get(key) as SavedProduct[],
  }));

  const noAisle = groups.get(NO_AISLE_KEY);
  if (noAisle) {
    sections.push({ key: NO_AISLE_KEY, title: 'Aisle unavailable', data: noAisle });
  }
  const notCarried = groups.get(NOT_CARRIED_KEY);
  if (notCarried) {
    sections.push({ key: NOT_CARRIED_KEY, title: 'Not carried here', data: notCarried });
  }
  return sections;
}
