/**
 * Product imagery: category inference and fallback art.
 *
 * Two rules make this honest:
 *  1. Real photos are only ever shown when the provider supplied them for
 *     that exact product (image_url arrives with the product row). We never
 *     attach a photo by fuzzy name similarity.
 *  2. When no verified photo exists we draw a neutral *category* placeholder
 *     derived from the store's own verified department/section text — an
 *     illustration, never a photo of a possibly-wrong product.
 */

import type { Ionicons } from '@expo/vector-icons';

import type { ProductHit } from '@/data/types';

export type ProductCategory =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'frozen'
  | 'bakery'
  | 'pantry'
  | 'snacks'
  | 'drinks'
  | 'household'
  | 'cleaning'
  | 'pharmacy'
  | 'personal-care'
  | 'pet'
  | 'baby'
  | 'hardware'
  | 'electronics'
  | 'other';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface CategoryArt {
  icon: IoniconName;
  /** Icon color on a light surface (≥3:1 against backgroundSelected). */
  tint: string;
  /** Icon color on a dark surface — lighter so the glyph stays visible. */
  tintDark: string;
  label: string;
}

const CATEGORY_ART: Record<ProductCategory, CategoryArt> = {
  produce: { icon: 'leaf-outline', tint: '#3F7D3F', tintDark: '#7CC47C', label: 'Produce' },
  dairy: { icon: 'water-outline', tint: '#3B6FB0', tintDark: '#7FB0E8', label: 'Dairy' },
  meat: { icon: 'restaurant-outline', tint: '#A64452', tintDark: '#E8909B', label: 'Meat' },
  frozen: { icon: 'snow-outline', tint: '#3F7EA6', tintDark: '#8FC8E8', label: 'Frozen' },
  bakery: { icon: 'pizza-outline', tint: '#96682A', tintDark: '#E0B476', label: 'Bakery' },
  pantry: { icon: 'file-tray-stacked-outline', tint: '#8A6D3B', tintDark: '#D4B584', label: 'Pantry' },
  snacks: { icon: 'fast-food-outline', tint: '#A16628', tintDark: '#E8B173', label: 'Snacks' },
  drinks: { icon: 'cafe-outline', tint: '#7A4E9E', tintDark: '#C3A0E0', label: 'Drinks' },
  household: { icon: 'home-outline', tint: '#54626F', tintDark: '#A8B8C6', label: 'Household' },
  cleaning: { icon: 'sparkles-outline', tint: '#297A77', tintDark: '#6FD1CD', label: 'Cleaning' },
  pharmacy: { icon: 'medkit-outline', tint: '#B3423F', tintDark: '#EF9490', label: 'Pharmacy' },
  'personal-care': { icon: 'happy-outline', tint: '#8A5AA8', tintDark: '#C8A3DE', label: 'Personal care' },
  pet: { icon: 'paw-outline', tint: '#8A6A3B', tintDark: '#D6B584', label: 'Pet' },
  baby: { icon: 'balloon-outline', tint: '#A85B8C', tintDark: '#E9A5CB', label: 'Baby' },
  hardware: { icon: 'hammer-outline', tint: '#63666A', tintDark: '#B0B0B0', label: 'Hardware' },
  electronics: { icon: 'hardware-chip-outline', tint: '#3E6E8E', tintDark: '#8CBBD8', label: 'Electronics' },
  other: { icon: 'cube-outline', tint: '#616A73', tintDark: '#AEB8C2', label: 'Product' },
};

/** Ordered keyword rules; first match wins. Matched against verified text. */
const RULES: [ProductCategory, RegExp][] = [
  ['produce', /produce|fruit|vegetab|fresh cut/i],
  ['dairy', /dairy|milk|cheese|yogurt|butter|egg/i],
  ['meat', /meat|seafood|poultry|deli|chicken|beef|pork|fish/i],
  ['frozen', /frozen|ice cream/i],
  ['bakery', /baker|bread|tortilla|pastry|donut/i],
  ['drinks', /beverage|drink|soda|juice|water|coffee|tea|soft drink|wine|beer|liquor/i],
  ['snacks', /snack|candy|chip|cookie|cracker|nut|chocolate/i],
  ['pharmacy', /pharmacy|first aid|medicine|health care|wellness|vitamin|supplement/i],
  ['personal-care', /oral care|hair care|beauty|personal care|skin|shave|deodorant|cosmetic|bath|body/i],
  ['baby', /baby|infant|diaper|formula/i],
  ['pet', /pet|dog|cat|bird|fish food/i],
  ['cleaning', /clean|laundry|detergent|dish|paper goods|paper towel|toilet paper|trash/i],
  ['hardware', /hardware|tool|batter|light bulb|paint|plumb|electrical|garden|automotive/i],
  ['electronics', /electronic|computer|phone|cable|hdmi|tv|audio|video game/i],
  ['household', /household|home|kitchen|storage|furniture|bedding/i],
  ['pantry', /pantry|grocery|cereal|pasta|sauce|canned|baking|condiment|rice|soup|breakfast/i],
];

/**
 * Infer a display category from the store's verified location text
 * (section/department) first, then the product's own category words.
 * Returns 'other' when nothing matches — never a guess dressed as a fact.
 */
export function inferCategory(input: {
  section?: string;
  department?: string;
  name?: string;
  brand?: string;
}): ProductCategory {
  const verified = [input.section, input.department].filter(Boolean).join(' ');
  for (const [category, pattern] of RULES) {
    if (verified && pattern.test(verified)) return category;
  }
  // Product name is a weaker signal, and it only ever selects an
  // illustration — never a photo — so it cannot mislabel a real product.
  const nameText = [input.name, input.brand].filter(Boolean).join(' ');
  for (const [category, pattern] of RULES) {
    if (nameText && pattern.test(nameText)) return category;
  }
  return 'other';
}

export function categoryArt(category: ProductCategory): CategoryArt {
  return CATEGORY_ART[category];
}

export function categoryForHit(hit: Pick<ProductHit, 'name' | 'brand' | 'location'>): ProductCategory {
  return inferCategory({
    section: hit.location?.section,
    department: hit.location?.department,
    name: hit.name,
    brand: hit.brand,
  });
}

/**
 * Choose the smallest verified image that covers the rendered size, so a
 * 48px row never downloads a 1200px hero. Falls back through the sizes the
 * provider actually gave us.
 */
export function pickImageUrl(
  sources: {
    thumbnailUrl?: string;
    mediumImageUrl?: string;
    largeImageUrl?: string;
    imageUrl?: string;
  },
  renderedSize: number
): string | undefined {
  const { thumbnailUrl, mediumImageUrl, largeImageUrl, imageUrl } = sources;
  if (renderedSize <= 64) {
    return thumbnailUrl ?? mediumImageUrl ?? imageUrl ?? largeImageUrl;
  }
  if (renderedSize <= 160) {
    return mediumImageUrl ?? imageUrl ?? largeImageUrl ?? thumbnailUrl;
  }
  return largeImageUrl ?? imageUrl ?? mediumImageUrl ?? thumbnailUrl;
}
