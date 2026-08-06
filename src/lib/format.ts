import type { Availability, ProductLocation } from '@/data/types';

export function availabilityLabel(availability: Availability): string {
  switch (availability) {
    case 'IN_STOCK':
      return 'In stock';
    case 'LOW_STOCK':
      return 'Low stock';
    case 'OUT_OF_STOCK':
      return 'Out of stock';
    case 'UNKNOWN':
      return 'Availability unknown';
  }
}

/** Compact one-line location summary for result rows, e.g. "Aisle G18 · Oral Care". */
export function locationSummary(location?: ProductLocation): string {
  if (!location) return 'Aisle info unavailable';
  const parts: string[] = [];
  if (location.aisle) parts.push(`Aisle ${location.aisle}`);
  if (location.section) parts.push(location.section);
  else if (location.department) parts.push(location.department);
  if (parts.length === 0) return location.department ?? 'Aisle info unavailable';
  return parts.join(' · ');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Human-friendly relative day label; `now` is injectable for tests. */
export function relativeDayLabel(iso?: string, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < 0) return 'today';
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 31) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
