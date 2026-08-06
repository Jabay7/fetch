/**
 * Search normalization and ranking shared by the mock provider and tests.
 * The Supabase provider implements the same tiers in SQL; keeping this pure
 * and dependency-free lets both sides be verified against one spec:
 *
 *   exact name > name prefix > word prefix > substring > all-tokens > fuzzy
 *
 * Fuzzy matching uses a Sørensen–Dice coefficient over character bigrams,
 * which tolerates the common one-or-two-letter typos ("toothpast",
 * "sensodine") without pulling in a dependency.
 */

export const MIN_SEARCH_LENGTH = 2;

export function normalizeSearchTerm(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ');
}

function bigrams(value: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i++) {
    grams.push(value.slice(i, i + 2));
  }
  return grams;
}

/** Sørensen–Dice similarity between two strings, in [0, 1]. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const gramsA = bigrams(a);
  const counts = new Map<string, number>();
  for (const gram of gramsA) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (const gram of bigrams(b)) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      counts.set(gram, remaining - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (gramsA.length + b.length - 1);
}

const FUZZY_THRESHOLD = 0.55;

function bestWordSimilarity(token: string, words: string[]): number {
  let best = 0;
  for (const word of words) {
    if (word.startsWith(token)) return 1;
    const similarity = diceSimilarity(token, word);
    if (similarity > best) best = similarity;
  }
  return best;
}

export interface RankableProduct {
  /** Display name, e.g. "Colgate Total Toothpaste". */
  name: string;
  /** Extra searchable text: brand, section, department, description. */
  extraText?: string;
}

/**
 * Score a product against a normalized search term. 0 means "no match".
 * Higher is better; tiers are spaced so a lower tier can never overtake
 * a higher one.
 */
export function scoreProduct(normalizedTerm: string, product: RankableProduct): number {
  const term = normalizedTerm;
  if (term.length < MIN_SEARCH_LENGTH) return 0;

  const name = normalizeSearchTerm(product.name);
  const haystack = normalizeSearchTerm(`${product.name} ${product.extraText ?? ''}`);
  const nameWords = name.split(' ');
  const haystackWords = haystack.split(' ');

  if (name === term) return 500;
  if (name.startsWith(term)) return 400;
  if (nameWords.some((word) => word.startsWith(term))) return 340;
  if (name.includes(term)) return 280;

  const tokens = term.split(' ');
  if (tokens.length > 1) {
    let total = 0;
    for (const token of tokens) {
      const quality = bestWordSimilarity(token, haystackWords);
      if (quality < FUZZY_THRESHOLD) {
        total = -1;
        break;
      }
      total += quality;
    }
    if (total > 0) return 220 + (20 * total) / tokens.length;
  } else {
    if (haystackWords.some((word) => word.startsWith(term))) return 180;
    const similarity = bestWordSimilarity(term, nameWords);
    if (similarity >= FUZZY_THRESHOLD) return 100 + 60 * similarity;
  }

  return 0;
}

export interface RankedResult<T> {
  item: T;
  score: number;
}

/** Rank a catalog against a raw search term; non-matches are dropped. */
export function rankCatalog<T extends RankableProduct>(
  rawTerm: string,
  catalog: T[],
  limit = 25
): T[] {
  const term = normalizeSearchTerm(rawTerm);
  if (term.length < MIN_SEARCH_LENGTH) return [];

  const ranked: RankedResult<T>[] = [];
  for (const item of catalog) {
    const score = scoreProduct(term, item);
    if (score > 0) ranked.push({ item, score });
  }

  ranked.sort(
    (a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)
  );
  return ranked.slice(0, limit).map((entry) => entry.item);
}
