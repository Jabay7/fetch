/**
 * Realistic demo catalog used by the mock provider and mirrored by
 * supabase/seed.sql. Fixed ids keep the two in sync.
 *
 * Scenario coverage (exercised by tests and the demo script in README):
 * - "toothpaste" at Schaumburg → Colgate Total, Aisle G18, Oral Care, in stock
 * - multiple matches for one term (four toothpastes + related oral care)
 * - product not found anywhere ("quinoa flakes")
 * - product carried only at another store (Hello Charcoal Toothpaste → Naperville)
 * - product out of stock (Pantene shampoo at Schaumburg)
 * - product with availability but no aisle data (Bounty towels at Schaumburg)
 * - changing store changes the aisle (Colgate: G18 → 12 → B7); the three
 *   stores intentionally use different aisle naming schemes
 */

import type { Availability, Store } from '../types';

export const STORE_SCHAUMBURG = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const STORE_NAPERVILLE = '9c858901-8a57-4791-81fe-4c455b099bc9';
export const STORE_EVANSTON = '16fd2706-8baf-433b-82eb-8c7fada847da';

export const MOCK_STORES: Store[] = [
  {
    id: STORE_SCHAUMBURG,
    name: 'Schaumburg Main Store',
    chain: 'Fetch Market',
    addressLine: '601 E Golf Rd',
    city: 'Schaumburg',
    state: 'IL',
    zip: '60173',
  },
  {
    id: STORE_NAPERVILLE,
    name: 'Naperville West Store',
    chain: 'Fetch Market',
    addressLine: '1550 N Route 59',
    city: 'Naperville',
    state: 'IL',
    zip: '60563',
  },
  {
    id: STORE_EVANSTON,
    name: 'Evanston Central Store',
    chain: 'Fetch Market',
    addressLine: '1111 Chicago Ave',
    city: 'Evanston',
    state: 'IL',
    zip: '60202',
  },
];

export interface MockProduct {
  id: string;
  name: string;
  brand?: string;
  sizeText?: string;
  description?: string;
  upc?: string;
}

export const MOCK_PRODUCTS: MockProduct[] = [
  // Oral care
  {
    id: 'p-colgate-total',
    brand: 'Colgate',
    name: 'Colgate Total Toothpaste',
    sizeText: '4.8 oz',
    description:
      'Whole-mouth clean with fluoride protection for teeth, tongue, cheeks, and gums.',
    upc: '0003500046013',
  },
  {
    id: 'p-crest-3d',
    brand: 'Crest',
    name: 'Crest 3D White Toothpaste',
    sizeText: '3.8 oz',
    description: 'Whitening toothpaste that removes up to 80% of surface stains.',
    upc: '0003700094560',
  },
  {
    id: 'p-sensodyne',
    brand: 'Sensodyne',
    name: 'Sensodyne Repair & Protect Toothpaste',
    sizeText: '3.4 oz',
    description: 'Daily toothpaste for sensitive teeth with stannous fluoride.',
    upc: '0031015806321',
  },
  {
    id: 'p-toms-toothpaste',
    brand: "Tom's of Maine",
    name: "Tom's of Maine Fluoride-Free Toothpaste",
    sizeText: '4.7 oz',
    description: 'Natural antiplaque and whitening toothpaste, peppermint.',
    upc: '0007732600110',
  },
  {
    id: 'p-hello-charcoal',
    brand: 'Hello',
    name: 'Hello Activated Charcoal Toothpaste',
    sizeText: '4 oz',
    description: 'Fluoride-free whitening toothpaste with activated charcoal.',
    upc: '0081925402011',
  },
  {
    id: 'p-oralb-brush',
    brand: 'Oral-B',
    name: 'Oral-B Pro-Health Toothbrush',
    sizeText: '2 ct',
    description: 'Soft-bristle toothbrushes with CrossAction angled bristles.',
    upc: '0030041667402',
  },
  {
    id: 'p-listerine',
    brand: 'Listerine',
    name: 'Listerine Cool Mint Mouthwash',
    sizeText: '1 L',
    description: 'Antiseptic mouthwash that kills 99% of germs that cause bad breath.',
    upc: '0031254742735',
  },
  {
    id: 'p-reach-floss',
    brand: 'Reach',
    name: 'Reach Waxed Dental Floss',
    sizeText: '55 yd',
    description: 'Shred-resistant waxed floss, mint flavor.',
    upc: '0038137003541',
  },
  // Grocery
  {
    id: 'p-whole-milk',
    brand: 'Countryside Dairy',
    name: 'Whole Milk',
    sizeText: '1 gal',
    description: 'Grade A pasteurized whole milk.',
    upc: '0001111041600',
  },
  {
    id: 'p-almond-milk',
    brand: 'Silk',
    name: 'Silk Unsweetened Almond Milk',
    sizeText: '64 fl oz',
    description: 'Dairy-free almond milk with no added sugar.',
    upc: '0002529300740',
  },
  {
    id: 'p-eggs',
    brand: 'Countryside Dairy',
    name: 'Large Grade A Eggs',
    sizeText: '12 ct',
    description: 'One dozen large white eggs.',
    upc: '0001111060903',
  },
  {
    id: 'p-butternut-bread',
    brand: 'Butternut',
    name: 'Butternut White Bread',
    sizeText: '20 oz',
    description: 'Classic soft white sandwich bread.',
    upc: '0007294560021',
  },
  {
    id: 'p-cheerios',
    brand: 'General Mills',
    name: 'Cheerios Cereal',
    sizeText: '18 oz Family Size',
    description: 'Whole-grain oat cereal.',
    upc: '0001600027528',
  },
  {
    id: 'p-spaghetti',
    brand: 'Barilla',
    name: 'Barilla Spaghetti',
    sizeText: '1 lb',
    description: 'Classic Italian spaghetti pasta.',
    upc: '0007680850012',
  },
  {
    id: 'p-marinara',
    brand: "Rao's",
    name: "Rao's Marinara Sauce",
    sizeText: '24 oz',
    description: 'Premium marinara made with Italian tomatoes.',
    upc: '0074714900153',
  },
  {
    id: 'p-coffee',
    brand: "Peet's Coffee",
    name: "Peet's Major Dickason's Ground Coffee",
    sizeText: '12 oz',
    description: 'Dark roast ground coffee.',
    upc: '0078571301024',
  },
  {
    id: 'p-avocado',
    name: 'Hass Avocado',
    sizeText: '1 ct',
    description: 'Fresh Hass avocado.',
    upc: '0000000004046',
  },
  {
    id: 'p-chicken-breast',
    name: 'Boneless Skinless Chicken Breast',
    sizeText: 'per lb',
    description: 'Fresh boneless skinless chicken breast.',
    upc: '0020123400000',
  },
  // Household
  {
    id: 'p-bounty-towels',
    brand: 'Bounty',
    name: 'Bounty Paper Towels',
    sizeText: '6 Double Rolls',
    description: '2-ply absorbent paper towels.',
    upc: '0003700074795',
  },
  {
    id: 'p-charmin',
    brand: 'Charmin',
    name: 'Charmin Ultra Soft Toilet Paper',
    sizeText: '12 Mega Rolls',
    description: '2-ply cushiony toilet paper.',
    upc: '0003700061924',
  },
  {
    id: 'p-tide',
    brand: 'Tide',
    name: 'Tide Original Laundry Detergent',
    sizeText: '92 fl oz',
    description: 'Liquid laundry detergent, original scent.',
    upc: '0003700040217',
  },
  {
    id: 'p-dawn',
    brand: 'Dawn',
    name: 'Dawn Ultra Dish Soap',
    sizeText: '19.4 fl oz',
    description: 'Concentrated dishwashing liquid.',
    upc: '0003700000445',
  },
  {
    id: 'p-duracell-aa',
    brand: 'Duracell',
    name: 'Duracell AA Batteries',
    sizeText: '16 ct',
    description: 'CopperTop alkaline AA batteries.',
    upc: '0004133303561',
  },
  {
    id: 'p-ge-bulb',
    brand: 'GE',
    name: 'GE LED Light Bulb, Soft White',
    sizeText: '60W equivalent, 2 ct',
    description: 'Dimmable A19 LED bulbs.',
    upc: '0004316893009',
  },
  // Health & beauty
  {
    id: 'p-pantene-shampoo',
    brand: 'Pantene',
    name: 'Pantene Daily Moisture Renewal Shampoo',
    sizeText: '17.9 fl oz',
    description: 'Moisturizing shampoo with Pro-V nutrients.',
    upc: '0008087818537',
  },
  {
    id: 'p-bandaid',
    brand: 'Band-Aid',
    name: 'Band-Aid Flexible Fabric Bandages',
    sizeText: '100 ct',
    description: 'Assorted-size flexible fabric adhesive bandages.',
    upc: '0038137004442',
  },
  {
    id: 'p-advil',
    brand: 'Advil',
    name: 'Advil Ibuprofen Tablets 200 mg',
    sizeText: '100 ct',
    description: 'Pain reliever and fever reducer.',
    upc: '0030573015401',
  },
  // Pets
  {
    id: 'p-purina-one',
    brand: 'Purina ONE',
    name: 'Purina ONE Chicken & Rice Dry Dog Food',
    sizeText: '16.5 lb',
    description: 'Natural dry dog food with real chicken.',
    upc: '0001780012919',
  },
];

export interface MockPlacement {
  productId: string;
  availability: Availability;
  aisle?: string;
  bay?: string;
  shelf?: string;
  section?: string;
  department?: string;
  updatedAt?: string;
}

const oral = { section: 'Oral Care', department: 'Health & Beauty' };
const dairy = { section: 'Dairy', department: 'Grocery' };
const bakery = { section: 'Bread & Bakery', department: 'Grocery' };
const cereal = { section: 'Cereal & Breakfast', department: 'Grocery' };
const pasta = { section: 'Pasta & Sauces', department: 'Grocery' };
const coffee = { section: 'Coffee & Tea', department: 'Grocery' };
const produce = { section: 'Fresh Produce', department: 'Produce' };
const meat = { section: 'Fresh Meat', department: 'Meat & Seafood' };
const paper = { section: 'Paper Goods', department: 'Household' };
const laundry = { section: 'Laundry & Cleaning', department: 'Household' };
const hardware = { section: 'Hardware & Batteries', department: 'Household' };
const hair = { section: 'Hair Care', department: 'Health & Beauty' };
const firstAid = { section: 'First Aid', department: 'Pharmacy' };
const pets = { section: 'Dog Food & Supplies', department: 'Pets' };

/**
 * Placements per store. Schaumburg uses letter+number aisles ("G18"),
 * Naperville plain numbers ("12"), Evanston letter-dash ("B7") — proving the
 * UI treats aisle codes as opaque strings.
 */
export const MOCK_PLACEMENTS: Record<string, MockPlacement[]> = {
  [STORE_SCHAUMBURG]: [
    { productId: 'p-colgate-total', availability: 'IN_STOCK', aisle: 'G18', bay: '3', shelf: '2', ...oral, updatedAt: '2026-08-04T09:15:00Z' },
    { productId: 'p-crest-3d', availability: 'IN_STOCK', aisle: 'G18', bay: '3', shelf: '3', ...oral, updatedAt: '2026-08-04T09:15:00Z' },
    { productId: 'p-sensodyne', availability: 'LOW_STOCK', aisle: 'G18', bay: '4', shelf: '2', ...oral, updatedAt: '2026-08-05T14:30:00Z' },
    { productId: 'p-toms-toothpaste', availability: 'IN_STOCK', aisle: 'G18', bay: '4', shelf: '4', ...oral, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-oralb-brush', availability: 'IN_STOCK', aisle: 'G18', bay: '5', shelf: '1', ...oral, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-listerine', availability: 'IN_STOCK', aisle: 'G17', bay: '1', shelf: '3', ...oral, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-reach-floss', availability: 'IN_STOCK', aisle: 'G18', bay: '5', shelf: '2', ...oral, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-whole-milk', availability: 'IN_STOCK', aisle: 'D2', section: dairy.section, department: dairy.department, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-almond-milk', availability: 'IN_STOCK', aisle: 'D2', section: dairy.section, department: dairy.department, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-eggs', availability: 'IN_STOCK', aisle: 'D3', section: dairy.section, department: dairy.department, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-butternut-bread', availability: 'IN_STOCK', aisle: 'B1', ...bakery, updatedAt: '2026-08-03T07:30:00Z' },
    { productId: 'p-cheerios', availability: 'IN_STOCK', aisle: 'A6', bay: '2', ...cereal, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-spaghetti', availability: 'IN_STOCK', aisle: 'A9', ...pasta, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-marinara', availability: 'IN_STOCK', aisle: 'A9', ...pasta, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-coffee', availability: 'IN_STOCK', aisle: 'A4', ...coffee, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-avocado', availability: 'IN_STOCK', ...produce, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-chicken-breast', availability: 'IN_STOCK', ...meat, updatedAt: '2026-08-05T06:00:00Z' },
    // Availability known, aisle unknown — exercises the "no aisle info" state.
    { productId: 'p-bounty-towels', availability: 'IN_STOCK', updatedAt: '2026-07-28T12:00:00Z' },
    { productId: 'p-charmin', availability: 'IN_STOCK', aisle: 'H2', bay: '1', ...paper, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-tide', availability: 'IN_STOCK', aisle: 'H5', ...laundry, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-dawn', availability: 'IN_STOCK', aisle: 'H5', ...laundry, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-duracell-aa', availability: 'IN_STOCK', aisle: 'H8', ...hardware, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-ge-bulb', availability: 'IN_STOCK', aisle: 'H8', ...hardware, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-pantene-shampoo', availability: 'OUT_OF_STOCK', aisle: 'G12', bay: '2', shelf: '3', ...hair, updatedAt: '2026-08-05T16:45:00Z' },
    { productId: 'p-bandaid', availability: 'IN_STOCK', aisle: 'G20', ...firstAid, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-advil', availability: 'IN_STOCK', aisle: 'G21', ...firstAid, updatedAt: '2026-08-01T08:00:00Z' },
    { productId: 'p-purina-one', availability: 'IN_STOCK', aisle: 'J3', ...pets, updatedAt: '2026-08-01T08:00:00Z' },
  ],
  [STORE_NAPERVILLE]: [
    // Same product, different aisle scheme and stock level than Schaumburg.
    { productId: 'p-colgate-total', availability: 'LOW_STOCK', aisle: '12', bay: '1', shelf: '2', ...oral, updatedAt: '2026-08-05T11:00:00Z' },
    { productId: 'p-crest-3d', availability: 'IN_STOCK', aisle: '12', bay: '1', shelf: '3', ...oral, updatedAt: '2026-08-05T11:00:00Z' },
    { productId: 'p-sensodyne', availability: 'IN_STOCK', aisle: '12', bay: '2', shelf: '2', ...oral, updatedAt: '2026-08-05T11:00:00Z' },
    // Carried here but not at Schaumburg.
    { productId: 'p-hello-charcoal', availability: 'IN_STOCK', aisle: '12', bay: '2', shelf: '4', ...oral, updatedAt: '2026-08-05T11:00:00Z' },
    { productId: 'p-listerine', availability: 'IN_STOCK', aisle: '13', ...oral, updatedAt: '2026-08-05T11:00:00Z' },
    { productId: 'p-whole-milk', availability: 'IN_STOCK', aisle: '1', section: dairy.section, department: dairy.department, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-eggs', availability: 'LOW_STOCK', aisle: '1', section: dairy.section, department: dairy.department, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-butternut-bread', availability: 'IN_STOCK', aisle: '3', ...bakery, updatedAt: '2026-08-03T07:30:00Z' },
    { productId: 'p-cheerios', availability: 'IN_STOCK', aisle: '6', ...cereal, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-bounty-towels', availability: 'IN_STOCK', aisle: '18', bay: '4', ...paper, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-tide', availability: 'IN_STOCK', aisle: '19', ...laundry, updatedAt: '2026-08-02T10:00:00Z' },
    // Stock level unknown — exercises the UNKNOWN availability state.
    { productId: 'p-duracell-aa', availability: 'UNKNOWN', aisle: '20', ...hardware },
    { productId: 'p-pantene-shampoo', availability: 'IN_STOCK', aisle: '11', ...hair, updatedAt: '2026-08-04T09:00:00Z' },
    { productId: 'p-advil', availability: 'IN_STOCK', aisle: '14', ...firstAid, updatedAt: '2026-08-04T09:00:00Z' },
    { productId: 'p-purina-one', availability: 'IN_STOCK', aisle: '22', ...pets, updatedAt: '2026-08-04T09:00:00Z' },
  ],
  [STORE_EVANSTON]: [
    // Smaller-format store: reduced assortment, third aisle naming scheme.
    { productId: 'p-colgate-total', availability: 'IN_STOCK', aisle: 'B7', shelf: '1', ...oral, updatedAt: '2026-08-03T13:00:00Z' },
    { productId: 'p-sensodyne', availability: 'IN_STOCK', aisle: 'B7', shelf: '2', ...oral, updatedAt: '2026-08-03T13:00:00Z' },
    { productId: 'p-listerine', availability: 'OUT_OF_STOCK', aisle: 'B7', shelf: '4', ...oral, updatedAt: '2026-08-05T09:30:00Z' },
    { productId: 'p-whole-milk', availability: 'IN_STOCK', aisle: 'A2', section: dairy.section, department: dairy.department, updatedAt: '2026-08-05T06:00:00Z' },
    { productId: 'p-butternut-bread', availability: 'IN_STOCK', aisle: 'A4', ...bakery, updatedAt: '2026-08-03T07:30:00Z' },
    { productId: 'p-cheerios', availability: 'IN_STOCK', aisle: 'C1', ...cereal, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-dawn', availability: 'IN_STOCK', aisle: 'D5', ...laundry, updatedAt: '2026-08-02T10:00:00Z' },
    { productId: 'p-advil', availability: 'IN_STOCK', aisle: 'B9', ...firstAid, updatedAt: '2026-08-02T10:00:00Z' },
  ],
};
