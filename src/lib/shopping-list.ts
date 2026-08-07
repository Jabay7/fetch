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
const TEXT_KEY = '__text__';
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
    const details = item.isTextItem ? undefined : resolved.get(item.id);
    const key = item.isTextItem
      ? TEXT_KEY
      : details === null
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
  const textItems = groups.get(TEXT_KEY);
  if (textItems) {
    sections.push({ key: TEXT_KEY, title: 'Unknown location', data: textItems });
  }
  const notCarried = groups.get(NOT_CARRIED_KEY);
  if (notCarried) {
    sections.push({ key: NOT_CARRIED_KEY, title: 'Not carried here', data: notCarried });
  }
  return sections;
}

/**
 * Split pasted free text ("milk\neggs, bread") into clean list entries.
 * Bullets, numbering, and quantity prefixes like "2x" are stripped; the
 * quantity is preserved.
 */
export function parseListText(raw: string): { name: string; quantity: number }[] {
  return raw
    .split(/[\n,;]+/)
    .map((line) => line.trim().replace(/^[-*•\s]+/, ''))
    .map((line) => {
      // "1. bread" / "2) eggs" is list numbering, not a quantity.
      const numbered = line.match(/^\d{1,3}[.)]\s+(.+)$/);
      if (numbered) return { name: numbered[1].trim(), quantity: 1 };
      // "2x paper towels", "3 apples".
      const quantified = line.match(/^(\d{1,2})\s*[xX×]?\s+(.+)$/);
      if (quantified) {
        return { name: quantified[2].trim(), quantity: parseInt(quantified[1], 10) };
      }
      return { name: line, quantity: 1 };
    })
    .filter((entry) => entry.name.length >= 2 && entry.name.length <= 80)
    .slice(0, 25);
}
