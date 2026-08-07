import {
  buildOverpassQuery,
  mapOsmElement,
  mapOsmElements,
  OSM_BRANDS,
  zipToState,
  type OsmElement,
} from '../osm-directory';

const TARGET = OSM_BRANDS.find((b) => b.slug === 'target')!;

const ELEMENT: OsmElement = {
  type: 'node',
  id: 123456,
  lat: 41.93,
  lon: -87.64,
  tags: {
    name: 'Target',
    brand: 'Target',
    'brand:wikidata': 'Q1046951',
    shop: 'department_store',
    'addr:housenumber': '2650',
    'addr:street': 'North Clark Street',
    'addr:city': 'Chicago',
    'addr:postcode': '60614',
    phone: '+1-773-555-0199',
    branch: 'Lincoln Park',
  },
};

describe('zipToState', () => {
  it.each([
    ['60614', 'IL'],
    ['10001', 'NY'],
    ['90210', 'CA'],
    ['77001', 'TX'],
    ['02134', 'MA'],
    ['33101', 'FL'],
    ['98101', 'WA'],
    ['85001', 'AZ'],
  ])('%s → %s', (zip, state) => {
    expect(zipToState(zip)).toBe(state);
  });

  it('rejects junk', () => {
    expect(zipToState('abcde')).toBeNull();
    expect(zipToState('123')).toBeNull();
  });
});

describe('mapOsmElement', () => {
  it('maps a fully tagged element with provenance and branch naming', () => {
    const row = mapOsmElement(ELEMENT, TARGET);
    expect(row).toMatchObject({
      retailer_slug: 'target',
      name: 'Target — Lincoln Park',
      chain: 'Target',
      address_line: '2650 North Clark Street',
      city: 'Chicago',
      state: 'IL',
      zip: '60614',
      latitude: 41.93,
      longitude: -87.64,
      source: 'OSM',
      source_id: 'node/123456',
      source_url: 'https://www.openstreetmap.org/node/123456',
      source_attribution: '© OpenStreetMap contributors (ODbL)',
      data_confidence: 'MEDIUM',
    });
  });

  it('derives state from ZIP when addr:state is missing, prefers addr:state otherwise', () => {
    expect(mapOsmElement(ELEMENT, TARGET)?.state).toBe('IL');
    const withState = {
      ...ELEMENT,
      tags: { ...ELEMENT.tags!, 'addr:state': 'wi' },
    };
    expect(mapOsmElement(withState, TARGET)?.state).toBe('WI');
  });

  it('rejects elements without a usable address — no half-records in the directory', () => {
    const noStreet = { ...ELEMENT, tags: { ...ELEMENT.tags!, 'addr:street': '' } };
    const noZip = { ...ELEMENT, tags: { ...ELEMENT.tags! } };
    delete noZip.tags['addr:postcode'];
    const noCity = { ...ELEMENT, tags: { ...ELEMENT.tags! } };
    delete noCity.tags['addr:city'];
    expect(mapOsmElement(noStreet, TARGET)).toBeNull();
    expect(mapOsmElement(noZip, TARGET)).toBeNull();
    expect(mapOsmElement(noCity, TARGET)).toBeNull();
  });

  it('normalizes ZIP+4 and takes way centers for polygons', () => {
    const way: OsmElement = {
      type: 'way',
      id: 789,
      center: { lat: 40.0, lon: -75.0 },
      tags: {
        ...ELEMENT.tags!,
        'addr:postcode': '19103-1234',
        'addr:city': 'Philadelphia',
      },
    };
    const row = mapOsmElement(way, TARGET);
    expect(row?.zip).toBe('19103');
    expect(row?.state).toBe('PA');
    expect(row?.latitude).toBe(40.0);
    expect(row?.source_id).toBe('way/789');
  });
});

describe('mapOsmElements', () => {
  it('dedupes union-query double-listings by source id', () => {
    const rows = mapOsmElements([ELEMENT, ELEMENT, { ...ELEMENT, id: 999 }], TARGET);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.source_id)).toEqual(['node/123456', 'node/999']);
  });
});

describe('buildOverpassQuery', () => {
  it('unions wikidata and brand-name clauses inside a US area query', () => {
    const query = buildOverpassQuery(TARGET);
    expect(query).toContain('area["ISO3166-1"="US"][admin_level=2]->.us;');
    expect(query).toContain('"brand:wikidata"="Q1046951"');
    expect(query).toContain('"brand"="Target"');
    expect(query).toContain('out center tags;');
  });

  it('escapes quotes in brand names', () => {
    const dicks = OSM_BRANDS.find((b) => b.slug === 'dicks')!;
    expect(buildOverpassQuery(dicks)).toContain("Dick's Sporting Goods");
  });
});

describe('OSM_BRANDS registry', () => {
  it('never includes Kroger-family banners (their stores come from the official API)', () => {
    const slugs = OSM_BRANDS.map((b) => b.slug);
    expect(slugs).not.toContain('kroger');
    expect(slugs).not.toContain('marianos');
    expect(slugs).not.toContain('ralphs');
  });

  it('has unique slugs', () => {
    const slugs = OSM_BRANDS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
