import {
  diceSimilarity,
  normalizeSearchTerm,
  rankCatalog,
  scoreProduct,
} from '../ranking';

describe('normalizeSearchTerm', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeSearchTerm('  Colgate   Toothpaste ')).toBe('colgate toothpaste');
  });
});

describe('diceSimilarity', () => {
  it('is 1 for identical strings and 0 for unrelated short strings', () => {
    expect(diceSimilarity('milk', 'milk')).toBe(1);
    expect(diceSimilarity('a', 'b')).toBe(0);
  });

  it('scores common typos above the fuzzy threshold', () => {
    expect(diceSimilarity('sensodine', 'sensodyne')).toBeGreaterThan(0.55);
    expect(diceSimilarity('toothpaste', 'toothbrush')).toBeLessThan(0.55);
  });
});

describe('scoreProduct tiers', () => {
  const colgate = { name: 'Colgate Total Toothpaste', extraText: 'Colgate Oral Care' };

  it('ranks exact name above prefix above word prefix above substring', () => {
    const exact = scoreProduct('colgate total toothpaste', colgate);
    const prefix = scoreProduct('colgate total', colgate);
    const wordPrefix = scoreProduct('tooth', colgate);
    const substring = scoreProduct('otal toothpas', colgate);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it('is case-insensitive via normalization', () => {
    expect(scoreProduct(normalizeSearchTerm('TOOTHPASTE'), colgate)).toBeGreaterThan(0);
  });

  it('matches misspellings through fuzzy similarity', () => {
    expect(scoreProduct('toothpaste', { name: 'Sensodyne Toothpaste' })).toBeGreaterThan(0);
    expect(scoreProduct('sensodine', { name: 'Sensodyne Repair Toothpaste' })).toBeGreaterThan(0);
  });

  it('requires every token of a multi-word term to match', () => {
    expect(scoreProduct('colgate tooth', colgate)).toBeGreaterThan(0);
    expect(scoreProduct('colgate quinoa', colgate)).toBe(0);
  });

  it('rejects terms below the minimum length', () => {
    expect(scoreProduct('a', colgate)).toBe(0);
  });
});

describe('rankCatalog', () => {
  const catalog = [
    { name: 'Crest 3D White Toothpaste' },
    { name: 'Toothpaste' },
    { name: 'Colgate Total Toothpaste' },
    { name: 'Toothpaste Travel Kit' },
  ];

  it('puts an exact match first, then prefixes, then word matches alphabetically', () => {
    const names = rankCatalog('toothpaste', catalog).map((p) => p.name);
    expect(names).toEqual([
      'Toothpaste',
      'Toothpaste Travel Kit',
      'Colgate Total Toothpaste',
      'Crest 3D White Toothpaste',
    ]);
  });

  it('returns an empty list for short or unmatched terms', () => {
    expect(rankCatalog('x', catalog)).toEqual([]);
    expect(rankCatalog('quinoa flakes', catalog)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(rankCatalog('toothpaste', catalog, 2)).toHaveLength(2);
  });
});
