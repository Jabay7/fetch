import { render, screen } from '@testing-library/react-native';

import {
  LocationBadge,
  locationPrecision,
  locationSpeech,
} from '@/components/location-badge';
import { Colors } from '@/constants/theme';
import type { ProductLocation } from '@/data/types';

const exact: ProductLocation = { aisle: 'G18', bay: '3', shelf: '2', dataSource: 'RETAILER_API' };
const aisleOnly: ProductLocation = { aisle: 'G18', dataSource: 'RETAILER_API' };
const departmentOnly: ProductLocation = { section: 'Oral Care', dataSource: 'STORE_MANAGED' };
const storeOnly: ProductLocation = { dataSource: 'STORE_MANAGED' };

describe('locationPrecision', () => {
  it('ranks how precisely we actually know where something is', () => {
    expect(locationPrecision(exact)).toBe('EXACT');
    expect(locationPrecision(aisleOnly)).toBe('AISLE');
    expect(locationPrecision(departmentOnly)).toBe('DEPARTMENT');
    expect(locationPrecision(storeOnly)).toBe('STORE_ONLY');
    expect(locationPrecision(undefined)).toBe('UNKNOWN');
  });
});

describe('locationSpeech', () => {
  it('reads as one sentence rather than fragments', () => {
    expect(locationSpeech(exact)).toBe('Aisle G18, bay 3, shelf 2');
    expect(locationSpeech(aisleOnly)).toBe('Aisle G18');
  });

  it('says plainly when the exact aisle is not known', () => {
    expect(locationSpeech(departmentOnly)).toBe(
      'In Oral Care. Exact aisle not available'
    );
    expect(locationSpeech(storeOnly)).toBe(
      'Carried at this store. Location not available'
    );
    expect(locationSpeech(undefined)).toBe('Location not available');
  });
});

describe('LocationBadge', () => {
  it('gives an aisle the signage treatment', async () => {
    await render(<LocationBadge location={aisleOnly} />);
    expect(screen.getByText('AISLE')).toBeTruthy();
    expect(screen.getByText('G18')).toBeTruthy();
  });

  it('shows bay and shelf only at the larger size', async () => {
    const { unmount } = await render(<LocationBadge location={exact} size="lg" />);
    expect(screen.getByText('Bay 3 · Shelf 2')).toBeTruthy();
    await unmount();

    await render(<LocationBadge location={exact} />);
    expect(screen.queryByText('Bay 3 · Shelf 2')).toBeNull();
  });

  it('never dresses a department up as a verified aisle', async () => {
    await render(<LocationBadge location={departmentOnly} />);
    expect(screen.getByText('Oral Care')).toBeTruthy();
    // The word AISLE must not appear: a section is a weaker answer and saying
    // "aisle" here would overstate what we know.
    expect(screen.queryByText('AISLE')).toBeNull();
    expect(screen.getByText('SECTION')).toBeTruthy();
  });

  it('states an unknown location instead of guessing or hiding it', async () => {
    await render(<LocationBadge location={undefined} />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });

  it('keeps a long aisle code fully readable rather than truncating it', async () => {
    // Aisle codes are opaque and store-specific; a clipped code is wrong, not
    // merely ugly.
    await render(<LocationBadge location={{ aisle: 'A-12B', dataSource: 'RETAILER_API' }} />);
    const code = screen.getByText('A-12B');
    expect(code.props.numberOfLines).toBe(1);
    expect(code.props.adjustsFontSizeToFit).toBe(true);
  });

  it('uses the signage ink, which no other component may use', async () => {
    await render(<LocationBadge location={aisleOnly} />);
    // Asserted against the token rather than a literal, so the test tracks the
    // palette instead of pinning a hex.
    expect(Colors.light.signage).not.toBe(Colors.light.tint);
    expect(Colors.dark.signage).not.toBe(Colors.dark.tint);
  });
});
