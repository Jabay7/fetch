/**
 * Client-side result filtering. Result sets are capped at 25, so filtering
 * the fetched list is instant and works offline; no extra requests.
 */

import type { ProductHit } from './types';

export interface ResultFilters {
  inStockOnly: boolean;
  /** A department/section name from `departmentOptions`, or null for all. */
  department: string | null;
}

export const NO_FILTERS: ResultFilters = { inStockOnly: false, department: null };

/** The department label a result is grouped under (section first). */
export function hitDepartment(hit: ProductHit): string | undefined {
  return hit.location?.section ?? hit.location?.department;
}

export function filterHits(hits: ProductHit[], filters: ResultFilters): ProductHit[] {
  return hits.filter((hit) => {
    if (filters.inStockOnly && hit.availability !== 'IN_STOCK') return false;
    if (filters.department && hitDepartment(hit) !== filters.department) return false;
    return true;
  });
}

/** Distinct department labels in a result set, by frequency then name. */
export function departmentOptions(hits: ProductHit[], max = 6): string[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const department = hitDepartment(hit);
    if (department) counts.set(department, (counts.get(department) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([name]) => name);
}
