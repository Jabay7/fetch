import { availabilityLabel, locationSummary, relativeDayLabel } from '../format';

describe('availabilityLabel', () => {
  it('maps every availability state to reader-friendly text', () => {
    expect(availabilityLabel('IN_STOCK')).toBe('In stock');
    expect(availabilityLabel('LOW_STOCK')).toBe('Low stock');
    expect(availabilityLabel('OUT_OF_STOCK')).toBe('Out of stock');
    expect(availabilityLabel('UNKNOWN')).toBe('Availability unknown');
  });
});

describe('locationSummary', () => {
  it('formats aisle and section', () => {
    expect(locationSummary({ aisle: 'G18', section: 'Oral Care' })).toBe(
      'Aisle G18 · Oral Care'
    );
  });

  it('falls back to department when there is no section', () => {
    expect(locationSummary({ aisle: 'D2', department: 'Grocery' })).toBe(
      'Aisle D2 · Grocery'
    );
    expect(locationSummary({ department: 'Produce' })).toBe('Produce');
  });

  it('handles missing locations', () => {
    expect(locationSummary(undefined)).toBe('Aisle info unavailable');
  });
});

describe('relativeDayLabel', () => {
  const now = new Date('2026-08-06T12:00:00Z');

  it('labels today, yesterday, and recent days', () => {
    expect(relativeDayLabel('2026-08-06T09:00:00Z', now)).toBe('today');
    expect(relativeDayLabel('2026-08-05T09:00:00Z', now)).toBe('yesterday');
    expect(relativeDayLabel('2026-08-01T09:00:00Z', now)).toBe('5 days ago');
  });

  it('returns null for missing or invalid dates', () => {
    expect(relativeDayLabel(undefined, now)).toBeNull();
    expect(relativeDayLabel('not-a-date', now)).toBeNull();
  });
});
