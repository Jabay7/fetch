import type {
  Availability,
  DataSource,
  ProductLocation,
  RetailerIntegrationStatus,
} from '@/data/types';

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

/** "$4.49" from integer cents; null when no price is available. */
export function priceLabel(priceCents?: number): string | null {
  if (priceCents === undefined || !Number.isFinite(priceCents)) return null;
  return `$${(priceCents / 100).toFixed(2)}`;
}

/** Reader-facing provenance label; null when the source is unknown. */
export function dataSourceLabel(dataSource?: DataSource): string | null {
  switch (dataSource) {
    case 'RETAILER_API':
      return 'Official retailer data';
    case 'AUTHORIZED_FEED':
      return 'Authorized feed';
    case 'STORE_MANAGED':
      return 'Store-provided data';
    case 'COMMUNITY_VERIFIED':
      return 'Community-verified';
    default:
      return null;
  }
}

/**
 * Trust label for a location record. Demo data always says so — mock
 * results are never presented as live retailer data.
 */
export function trustLabel(
  location: ProductLocation | undefined,
  isDemoData: boolean
): string | null {
  if (isDemoData) return 'Demo data';
  if (!location) return null;
  if (location.verificationStatus === 'VERIFIED') return 'Verified database data';
  return dataSourceLabel(location.dataSource);
}

/** Honest, user-facing description of a retailer's integration state. */
export function integrationStatusLabel(
  status?: RetailerIntegrationStatus
): string | null {
  switch (status) {
    case 'partnership_required':
      return 'Retailer partnership required';
    case 'directory_only':
      return 'Store directory only';
    case 'unsupported':
      return 'Retailer integration unavailable';
    case 'temporarily_unavailable':
      return 'Temporarily unavailable';
    case 'development':
      return 'Integration in development';
    default:
      return null; // live / import_supported need no caveat
  }
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
