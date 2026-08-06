-- Fetch demo seed (v2). Mirrors src/data/mock/data.ts so the Supabase
-- provider reproduces every scenario the mock provider's tests cover:
-- Colgate Total at Schaumburg = Aisle G18 / Oral Care / in stock / $4.49,
-- different aisles and prices per store, an out-of-stock item, an item with
-- no aisle data, an item carried only at Naperville, a community-verified
-- location at Evanston, and a departments-only retailer (Lakeview Drug Co).
-- Run after migrations 0001 and 0002.

begin;

-- Demo retailers (fictional; their data is clearly labeled demo/dev data).
insert into retailers (id, name, slug, integration_status, website_url) values
  ('d94f2a10-4b3c-4a2e-8f6d-2e7b9c051a33', 'Fetch Market', 'fetch-market', 'import_supported', null),
  ('5a8c3e91-2d47-4f0b-9c1e-7b6a4d28e502', 'Lakeview Drug Co', 'lakeview-drug-co', 'live', null);

insert into retailer_capabilities
  (retailer_id, store_directory, product_catalog, store_specific_products,
   inventory, pricing, aisle_locations, store_map, official_public_api,
   partner_api, commercial_approval_required, notes, last_reviewed_at)
values
  ('d94f2a10-4b3c-4a2e-8f6d-2e7b9c051a33', true, true, true, true, true, true, false,
   false, false, false, 'Fictional demo retailer fed by store-managed imports.', now()),
  ('5a8c3e91-2d47-4f0b-9c1e-7b6a4d28e502', true, true, true, false, false, false, false,
   false, false, false, 'Fictional demo retailer with a departments-only feed.', now());

insert into departments (name) values
  ('Health & Beauty'),
  ('Grocery'),
  ('Produce'),
  ('Meat & Seafood'),
  ('Household'),
  ('Pharmacy'),
  ('Pets');

insert into stores (id, retailer_id, name, chain, address_line, city, state, zip) values
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'd94f2a10-4b3c-4a2e-8f6d-2e7b9c051a33', 'Schaumburg Main Store', 'Fetch Market', '601 E Golf Rd', 'Schaumburg', 'IL', '60173'),
  ('9c858901-8a57-4791-81fe-4c455b099bc9', 'd94f2a10-4b3c-4a2e-8f6d-2e7b9c051a33', 'Naperville West Store', 'Fetch Market', '1550 N Route 59', 'Naperville', 'IL', '60563'),
  ('16fd2706-8baf-433b-82eb-8c7fada847da', 'd94f2a10-4b3c-4a2e-8f6d-2e7b9c051a33', 'Evanston Central Store', 'Fetch Market', '1111 Chicago Ave', 'Evanston', 'IL', '60202'),
  ('7c9e6679-7425-40de-944b-e07fc1f90ae7', '5a8c3e91-2d47-4f0b-9c1e-7b6a4d28e502', 'Lakeview Drug Co — Clark St', 'Lakeview Drug Co', '3024 N Clark St', 'Chicago', 'IL', '60657');

insert into store_capabilities
  (store_id, aisle_data, inventory, pricing, product_images, store_map, realtime, last_synced_at)
values
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', true, true, true, false, false, false, '2026-08-05 22:00:00+00'),
  ('9c858901-8a57-4791-81fe-4c455b099bc9', true, true, true, false, false, false, '2026-08-05 22:00:00+00'),
  ('16fd2706-8baf-433b-82eb-8c7fada847da', true, true, true, false, false, false, '2026-08-05 22:00:00+00'),
  ('7c9e6679-7425-40de-944b-e07fc1f90ae7', false, false, false, false, false, false, '2026-08-01 09:00:00+00');

insert into aisles (store_id, code)
select 'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid, t.code
from unnest(array['G18','G17','G12','G20','G21','D2','D3','B1','A6','A9','A4','H2','H5','H8','J3']) as t(code);

insert into aisles (store_id, code)
select '9c858901-8a57-4791-81fe-4c455b099bc9'::uuid, t.code
from unnest(array['12','13','1','3','6','18','19','20','11','14','22']) as t(code);

insert into aisles (store_id, code)
select '16fd2706-8baf-433b-82eb-8c7fada847da'::uuid, t.code
from unnest(array['B7','A2','A4','C1','D5','B9']) as t(code);

insert into products (name, brand, size_text, description, upc) values
  ('Colgate Total Toothpaste', 'Colgate', '4.8 oz', 'Whole-mouth clean with fluoride protection for teeth, tongue, cheeks, and gums.', '0003500046013'),
  ('Crest 3D White Toothpaste', 'Crest', '3.8 oz', 'Whitening toothpaste that removes up to 80% of surface stains.', '0003700094560'),
  ('Sensodyne Repair & Protect Toothpaste', 'Sensodyne', '3.4 oz', 'Daily toothpaste for sensitive teeth with stannous fluoride.', '0031015806321'),
  ('Tom''s of Maine Fluoride-Free Toothpaste', 'Tom''s of Maine', '4.7 oz', 'Natural antiplaque and whitening toothpaste, peppermint.', '0007732600110'),
  ('Hello Activated Charcoal Toothpaste', 'Hello', '4 oz', 'Fluoride-free whitening toothpaste with activated charcoal.', '0081925402011'),
  ('Oral-B Pro-Health Toothbrush', 'Oral-B', '2 ct', 'Soft-bristle toothbrushes with CrossAction angled bristles.', '0030041667402'),
  ('Listerine Cool Mint Mouthwash', 'Listerine', '1 L', 'Antiseptic mouthwash that kills 99% of germs that cause bad breath.', '0031254742735'),
  ('Reach Waxed Dental Floss', 'Reach', '55 yd', 'Shred-resistant waxed floss, mint flavor.', '0038137003541'),
  ('Whole Milk', 'Countryside Dairy', '1 gal', 'Grade A pasteurized whole milk.', '0001111041600'),
  ('Silk Unsweetened Almond Milk', 'Silk', '64 fl oz', 'Dairy-free almond milk with no added sugar.', '0002529300740'),
  ('Large Grade A Eggs', 'Countryside Dairy', '12 ct', 'One dozen large white eggs.', '0001111060903'),
  ('Butternut White Bread', 'Butternut', '20 oz', 'Classic soft white sandwich bread.', '0007294560021'),
  ('Cheerios Cereal', 'General Mills', '18 oz Family Size', 'Whole-grain oat cereal.', '0001600027528'),
  ('Barilla Spaghetti', 'Barilla', '1 lb', 'Classic Italian spaghetti pasta.', '0007680850012'),
  ('Rao''s Marinara Sauce', 'Rao''s', '24 oz', 'Premium marinara made with Italian tomatoes.', '0074714900153'),
  ('Peet''s Major Dickason''s Ground Coffee', 'Peet''s Coffee', '12 oz', 'Dark roast ground coffee.', '0078571301024'),
  ('Hass Avocado', null, '1 ct', 'Fresh Hass avocado.', '0000000004046'),
  ('Boneless Skinless Chicken Breast', null, 'per lb', 'Fresh boneless skinless chicken breast.', '0020123400000'),
  ('Bounty Paper Towels', 'Bounty', '6 Double Rolls', '2-ply absorbent paper towels.', '0003700074795'),
  ('Charmin Ultra Soft Toilet Paper', 'Charmin', '12 Mega Rolls', '2-ply cushiony toilet paper.', '0003700061924'),
  ('Tide Original Laundry Detergent', 'Tide', '92 fl oz', 'Liquid laundry detergent, original scent.', '0003700040217'),
  ('Dawn Ultra Dish Soap', 'Dawn', '19.4 fl oz', 'Concentrated dishwashing liquid.', '0003700000445'),
  ('Duracell AA Batteries', 'Duracell', '16 ct', 'CopperTop alkaline AA batteries.', '0004133303561'),
  ('GE LED Light Bulb, Soft White', 'GE', '60W equivalent, 2 ct', 'Dimmable A19 LED bulbs.', '0004316893009'),
  ('Pantene Daily Moisture Renewal Shampoo', 'Pantene', '17.9 fl oz', 'Moisturizing shampoo with Pro-V nutrients.', '0008087818537'),
  ('Band-Aid Flexible Fabric Bandages', 'Band-Aid', '100 ct', 'Assorted-size flexible fabric adhesive bandages.', '0038137004442'),
  ('Advil Ibuprofen Tablets 200 mg', 'Advil', '100 ct', 'Pain reliever and fever reducer.', '0030573015401'),
  ('Purina ONE Chicken & Rice Dry Dog Food', 'Purina ONE', '16.5 lb', 'Natural dry dog food with real chicken.', '0001780012919');

-- ---------------------------------------------------------------------------
-- Schaumburg Main Store
-- ---------------------------------------------------------------------------
with placements(upc, availability, updated_at) as (
  values
    ('0003500046013', 'IN_STOCK', '2026-08-04 09:15:00+00'),
    ('0003700094560', 'IN_STOCK', '2026-08-04 09:15:00+00'),
    ('0031015806321', 'LOW_STOCK', '2026-08-05 14:30:00+00'),
    ('0007732600110', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0030041667402', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0031254742735', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0038137003541', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0001111041600', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0002529300740', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0001111060903', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0007294560021', 'IN_STOCK', '2026-08-03 07:30:00+00'),
    ('0001600027528', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0007680850012', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0074714900153', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0078571301024', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0000000004046', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0020123400000', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0003700074795', 'IN_STOCK', '2026-07-28 12:00:00+00'),
    ('0003700061924', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0003700040217', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0003700000445', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0004133303561', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0004316893009', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0008087818537', 'OUT_OF_STOCK', '2026-08-05 16:45:00+00'),
    ('0038137004442', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0030573015401', 'IN_STOCK', '2026-08-01 08:00:00+00'),
    ('0001780012919', 'IN_STOCK', '2026-08-01 08:00:00+00')
)
insert into store_products (store_id, product_id, availability, updated_at)
select 'f47ac10b-58cc-4372-a567-0e02b2c3d479', p.id, pl.availability::availability_status, pl.updated_at::timestamptz
from placements pl
join products p on p.upc = pl.upc;

-- No row for Bounty (0003700074795): availability known, aisle unknown.
with locations(upc, aisle, bay, shelf, section, department, updated_at) as (
  values
    ('0003500046013', 'G18', '3', '2', 'Oral Care', 'Health & Beauty', '2026-08-04 09:15:00+00'),
    ('0003700094560', 'G18', '3', '3', 'Oral Care', 'Health & Beauty', '2026-08-04 09:15:00+00'),
    ('0031015806321', 'G18', '4', '2', 'Oral Care', 'Health & Beauty', '2026-08-05 14:30:00+00'),
    ('0007732600110', 'G18', '4', '4', 'Oral Care', 'Health & Beauty', '2026-08-01 08:00:00+00'),
    ('0030041667402', 'G18', '5', '1', 'Oral Care', 'Health & Beauty', '2026-08-01 08:00:00+00'),
    ('0031254742735', 'G17', '1', '3', 'Oral Care', 'Health & Beauty', '2026-08-01 08:00:00+00'),
    ('0038137003541', 'G18', '5', '2', 'Oral Care', 'Health & Beauty', '2026-08-01 08:00:00+00'),
    ('0001111041600', 'D2', null, null, 'Dairy', 'Grocery', '2026-08-05 06:00:00+00'),
    ('0002529300740', 'D2', null, null, 'Dairy', 'Grocery', '2026-08-05 06:00:00+00'),
    ('0001111060903', 'D3', null, null, 'Dairy', 'Grocery', '2026-08-05 06:00:00+00'),
    ('0007294560021', 'B1', null, null, 'Bread & Bakery', 'Grocery', '2026-08-03 07:30:00+00'),
    ('0001600027528', 'A6', '2', null, 'Cereal & Breakfast', 'Grocery', '2026-08-02 10:00:00+00'),
    ('0007680850012', 'A9', null, null, 'Pasta & Sauces', 'Grocery', '2026-08-02 10:00:00+00'),
    ('0074714900153', 'A9', null, null, 'Pasta & Sauces', 'Grocery', '2026-08-02 10:00:00+00'),
    ('0078571301024', 'A4', null, null, 'Coffee & Tea', 'Grocery', '2026-08-02 10:00:00+00'),
    ('0000000004046', null, null, null, 'Fresh Produce', 'Produce', '2026-08-05 06:00:00+00'),
    ('0020123400000', null, null, null, 'Fresh Meat', 'Meat & Seafood', '2026-08-05 06:00:00+00'),
    ('0003700061924', 'H2', '1', null, 'Paper Goods', 'Household', '2026-08-01 08:00:00+00'),
    ('0003700040217', 'H5', null, null, 'Laundry & Cleaning', 'Household', '2026-08-01 08:00:00+00'),
    ('0003700000445', 'H5', null, null, 'Laundry & Cleaning', 'Household', '2026-08-01 08:00:00+00'),
    ('0004133303561', 'H8', null, null, 'Hardware & Batteries', 'Household', '2026-08-01 08:00:00+00'),
    ('0004316893009', 'H8', null, null, 'Hardware & Batteries', 'Household', '2026-08-01 08:00:00+00'),
    ('0008087818537', 'G12', '2', '3', 'Hair Care', 'Health & Beauty', '2026-08-05 16:45:00+00'),
    ('0038137004442', 'G20', null, null, 'First Aid', 'Pharmacy', '2026-08-01 08:00:00+00'),
    ('0030573015401', 'G21', null, null, 'First Aid', 'Pharmacy', '2026-08-01 08:00:00+00'),
    ('0001780012919', 'J3', null, null, 'Dog Food & Supplies', 'Pets', '2026-08-01 08:00:00+00')
)
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, data_source, updated_at)
select sp.id, a.id, l.bay, l.shelf, l.section, d.id, 'STORE_MANAGED', l.updated_at::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
left join aisles a on a.store_id = sp.store_id and a.code = l.aisle
left join departments d on d.name = l.department;

with prices_list(upc, cents) as (
  values
    ('0003500046013', 449), ('0003700094560', 499), ('0031015806321', 699),
    ('0007732600110', 549), ('0030041667402', 649), ('0031254742735', 749),
    ('0038137003541', 329), ('0001111041600', 389), ('0002529300740', 349),
    ('0001111060903', 329), ('0007294560021', 289), ('0001600027528', 549),
    ('0007680850012', 179), ('0074714900153', 899), ('0078571301024', 1099),
    ('0000000004046', 129), ('0020123400000', 399), ('0003700074795', 1899),
    ('0003700061924', 2399), ('0003700040217', 1299), ('0003700000445', 449),
    ('0004133303561', 1599), ('0004316893009', 899), ('0008087818537', 649),
    ('0038137004442', 499), ('0030573015401', 1099), ('0001780012919', 2799)
)
insert into prices (store_product_id, regular_price_cents, captured_at)
select sp.id, pl.cents, sp.updated_at
from prices_list pl
join products p on p.upc = pl.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- ---------------------------------------------------------------------------
-- Naperville West Store (same products, different aisles and prices; carries
-- the charcoal toothpaste Schaumburg doesn't; Duracell has UNKNOWN stock)
-- ---------------------------------------------------------------------------
with placements(upc, availability, updated_at) as (
  values
    ('0003500046013', 'LOW_STOCK', '2026-08-05 11:00:00+00'),
    ('0003700094560', 'IN_STOCK', '2026-08-05 11:00:00+00'),
    ('0031015806321', 'IN_STOCK', '2026-08-05 11:00:00+00'),
    ('0081925402011', 'IN_STOCK', '2026-08-05 11:00:00+00'),
    ('0031254742735', 'IN_STOCK', '2026-08-05 11:00:00+00'),
    ('0001111041600', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0001111060903', 'LOW_STOCK', '2026-08-05 06:00:00+00'),
    ('0007294560021', 'IN_STOCK', '2026-08-03 07:30:00+00'),
    ('0001600027528', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0003700074795', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0003700040217', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0004133303561', 'UNKNOWN', '2026-08-02 10:00:00+00'),
    ('0008087818537', 'IN_STOCK', '2026-08-04 09:00:00+00'),
    ('0030573015401', 'IN_STOCK', '2026-08-04 09:00:00+00'),
    ('0001780012919', 'IN_STOCK', '2026-08-04 09:00:00+00')
)
insert into store_products (store_id, product_id, availability, updated_at)
select '9c858901-8a57-4791-81fe-4c455b099bc9', p.id, pl.availability::availability_status, pl.updated_at::timestamptz
from placements pl
join products p on p.upc = pl.upc;

with locations(upc, aisle, bay, shelf, section, department, updated_at) as (
  values
    ('0003500046013', '12', '1', '2', 'Oral Care', 'Health & Beauty', '2026-08-05 11:00:00+00'),
    ('0003700094560', '12', '1', '3', 'Oral Care', 'Health & Beauty', '2026-08-05 11:00:00+00'),
    ('0031015806321', '12', '2', '2', 'Oral Care', 'Health & Beauty', '2026-08-05 11:00:00+00'),
    ('0081925402011', '12', '2', '4', 'Oral Care', 'Health & Beauty', '2026-08-05 11:00:00+00'),
    ('0031254742735', '13', null, null, 'Oral Care', 'Health & Beauty', '2026-08-05 11:00:00+00'),
    ('0001111041600', '1', null, null, 'Dairy', 'Grocery', '2026-08-05 06:00:00+00'),
    ('0001111060903', '1', null, null, 'Dairy', 'Grocery', '2026-08-05 06:00:00+00'),
    ('0007294560021', '3', null, null, 'Bread & Bakery', 'Grocery', '2026-08-03 07:30:00+00'),
    ('0001600027528', '6', null, null, 'Cereal & Breakfast', 'Grocery', '2026-08-02 10:00:00+00'),
    ('0003700074795', '18', '4', null, 'Paper Goods', 'Household', '2026-08-02 10:00:00+00'),
    ('0003700040217', '19', null, null, 'Laundry & Cleaning', 'Household', '2026-08-02 10:00:00+00'),
    ('0004133303561', '20', null, null, 'Hardware & Batteries', 'Household', '2026-08-02 10:00:00+00'),
    ('0008087818537', '11', null, null, 'Hair Care', 'Health & Beauty', '2026-08-04 09:00:00+00'),
    ('0030573015401', '14', null, null, 'First Aid', 'Pharmacy', '2026-08-04 09:00:00+00'),
    ('0001780012919', '22', null, null, 'Dog Food & Supplies', 'Pets', '2026-08-04 09:00:00+00')
)
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, data_source, updated_at)
select sp.id, a.id, l.bay, l.shelf, l.section, d.id, 'STORE_MANAGED', l.updated_at::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '9c858901-8a57-4791-81fe-4c455b099bc9'
left join aisles a on a.store_id = sp.store_id and a.code = l.aisle
left join departments d on d.name = l.department;

with prices_list(upc, cents) as (
  values
    ('0003500046013', 439), ('0003700094560', 489), ('0031015806321', 689),
    ('0081925402011', 599), ('0031254742735', 739), ('0001111041600', 399),
    ('0001111060903', 319), ('0007294560021', 279), ('0001600027528', 539),
    ('0003700074795', 1849), ('0003700040217', 1279), ('0004133303561', 1579),
    ('0008087818537', 659), ('0030573015401', 1089), ('0001780012919', 2749)
)
insert into prices (store_product_id, regular_price_cents, captured_at)
select sp.id, pl.cents, sp.updated_at
from prices_list pl
join products p on p.upc = pl.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '9c858901-8a57-4791-81fe-4c455b099bc9';

-- ---------------------------------------------------------------------------
-- Evanston Central Store (small format; Colgate's location was shopper-
-- reported and staff-verified — community data, medium confidence)
-- ---------------------------------------------------------------------------
with placements(upc, availability, updated_at) as (
  values
    ('0003500046013', 'IN_STOCK', '2026-08-03 13:00:00+00'),
    ('0031015806321', 'IN_STOCK', '2026-08-03 13:00:00+00'),
    ('0031254742735', 'OUT_OF_STOCK', '2026-08-05 09:30:00+00'),
    ('0001111041600', 'IN_STOCK', '2026-08-05 06:00:00+00'),
    ('0007294560021', 'IN_STOCK', '2026-08-03 07:30:00+00'),
    ('0001600027528', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0003700000445', 'IN_STOCK', '2026-08-02 10:00:00+00'),
    ('0030573015401', 'IN_STOCK', '2026-08-02 10:00:00+00')
)
insert into store_products (store_id, product_id, availability, updated_at)
select '16fd2706-8baf-433b-82eb-8c7fada847da', p.id, pl.availability::availability_status, pl.updated_at::timestamptz
from placements pl
join products p on p.upc = pl.upc;

with locations(upc, aisle, bay, shelf, section, department, data_source, confidence, updated_at) as (
  values
    ('0003500046013', 'B7', null, '1', 'Oral Care', 'Health & Beauty', 'COMMUNITY_VERIFIED', 'MEDIUM', '2026-08-03 13:00:00+00'),
    ('0031015806321', 'B7', null, '2', 'Oral Care', 'Health & Beauty', 'STORE_MANAGED', 'HIGH', '2026-08-03 13:00:00+00'),
    ('0031254742735', 'B7', null, '4', 'Oral Care', 'Health & Beauty', 'STORE_MANAGED', 'HIGH', '2026-08-05 09:30:00+00'),
    ('0001111041600', 'A2', null, null, 'Dairy', 'Grocery', 'STORE_MANAGED', 'HIGH', '2026-08-05 06:00:00+00'),
    ('0007294560021', 'A4', null, null, 'Bread & Bakery', 'Grocery', 'STORE_MANAGED', 'HIGH', '2026-08-03 07:30:00+00'),
    ('0001600027528', 'C1', null, null, 'Cereal & Breakfast', 'Grocery', 'STORE_MANAGED', 'HIGH', '2026-08-02 10:00:00+00'),
    ('0003700000445', 'D5', null, null, 'Laundry & Cleaning', 'Household', 'STORE_MANAGED', 'HIGH', '2026-08-02 10:00:00+00'),
    ('0030573015401', 'B9', null, null, 'First Aid', 'Pharmacy', 'STORE_MANAGED', 'HIGH', '2026-08-02 10:00:00+00')
)
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, data_source, confidence, updated_at)
select sp.id, a.id, l.bay, l.shelf, l.section, d.id, l.data_source, l.confidence, l.updated_at::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '16fd2706-8baf-433b-82eb-8c7fada847da'
left join aisles a on a.store_id = sp.store_id and a.code = l.aisle
left join departments d on d.name = l.department;

with prices_list(upc, cents) as (
  values
    ('0003500046013', 459), ('0031015806321', 699), ('0031254742735', 749),
    ('0001111041600', 409), ('0007294560021', 299), ('0001600027528', 549),
    ('0003700000445', 439), ('0030573015401', 1079)
)
insert into prices (store_product_id, regular_price_cents, captured_at)
select sp.id, pl.cents, sp.updated_at
from prices_list pl
join products p on p.upc = pl.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '16fd2706-8baf-433b-82eb-8c7fada847da';

-- ---------------------------------------------------------------------------
-- Lakeview Drug Co — Clark St (departments-only retailer feed: no aisles,
-- no stock levels, no prices; availability stays UNKNOWN)
-- ---------------------------------------------------------------------------
with placements(upc) as (
  values
    ('0003500046013'), ('0031015806321'), ('0031254742735'), ('0038137003541'),
    ('0008087818537'), ('0038137004442'), ('0030573015401'), ('0003700061924')
)
insert into store_products (store_id, product_id, availability, updated_at)
select '7c9e6679-7425-40de-944b-e07fc1f90ae7', p.id, 'UNKNOWN'::availability_status, '2026-08-01 09:00:00+00'::timestamptz
from placements pl
join products p on p.upc = pl.upc;

with locations(upc, section, department) as (
  values
    ('0003500046013', 'Oral Care', 'Health & Beauty'),
    ('0031015806321', 'Oral Care', 'Health & Beauty'),
    ('0031254742735', 'Oral Care', 'Health & Beauty'),
    ('0038137003541', 'Oral Care', 'Health & Beauty'),
    ('0008087818537', 'Hair Care', 'Health & Beauty'),
    ('0038137004442', 'First Aid', 'Pharmacy'),
    ('0030573015401', 'First Aid', 'Pharmacy'),
    ('0003700061924', 'Paper Goods', 'Household')
)
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, data_source, updated_at)
select sp.id, null, null, null, l.section, d.id, 'RETAILER_API', '2026-08-01 09:00:00+00'::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
left join departments d on d.name = l.department;

-- ---------------------------------------------------------------------------
-- Product aliases (alternative names for specific products) and query-level
-- search aliases. The search_aliases rows mirror src/data/ranking.ts
-- SYNONYMS — keep both in sync when adding shopper vocabulary.
-- ---------------------------------------------------------------------------
with aliases(upc, alias, alias_type) as (
  values
    ('0003500046013', 'anticavity toothpaste', 'SYNONYM'),
    ('0030573015401', 'ibuprofen', 'GENERIC_NAME'),
    ('0030573015401', 'pain reliever', 'GENERIC_NAME'),
    ('0030573015401', 'painkiller', 'SYNONYM'),
    ('0038137004442', 'bandages', 'GENERIC_NAME'),
    ('0038137004442', 'bandaids', 'PLURAL'),
    ('0031254742735', 'mouth wash', 'SYNONYM'),
    ('0001780012919', 'dog food', 'GENERIC_NAME'),
    ('0001780012919', 'kibble', 'SYNONYM'),
    ('0003700061924', 'toilet paper', 'GENERIC_NAME'),
    ('0003700074795', 'kitchen roll', 'REGIONAL')
)
insert into product_aliases (product_id, alias, alias_type)
select p.id, a.alias, a.alias_type
from aliases a
join products p on p.upc = a.upc;

insert into search_aliases (term, expansion) values
  ('tp', 'toilet paper'),
  ('kitchen roll', 'paper towels'),
  ('kitchen towel', 'paper towels'),
  ('bandaids', 'bandages'),
  ('band aids', 'bandages'),
  ('painkiller', 'ibuprofen'),
  ('pain reliever', 'ibuprofen'),
  ('pain medicine', 'pain reliever'),
  ('kibble', 'dog food'),
  ('soda', 'soft drink'),
  ('pop', 'soft drink');

-- ---------------------------------------------------------------------------
-- Demo product variants (exercise the variant schema; store rows still point
-- at the base products)
-- ---------------------------------------------------------------------------
with variants(upc, name, size_text, pack_count) as (
  values
    ('0003500046013', 'Colgate Total Toothpaste 4.8 oz', '4.8 oz', 1),
    ('0003500046013', 'Colgate Total Toothpaste Twin Pack', '4.8 oz', 2),
    ('0001780012919', 'Purina ONE Chicken & Rice 16.5 lb', '16.5 lb', 1),
    ('0001780012919', 'Purina ONE Chicken & Rice 31.1 lb', '31.1 lb', 1)
)
insert into product_variants (product_id, name, size_text, pack_count)
select p.id, v.name, v.size_text, v.pack_count
from variants v
join products p on p.upc = v.upc;

-- ---------------------------------------------------------------------------
-- Retailer support matrix: real US retailers, researched from official
-- sources (docs/RETAILER-INTEGRATIONS.md + docs/research/
-- retailer-research-2026-08.json). These rows carry NO stores and NO
-- products — they exist so the app and admin surface can honestly report
-- integration status. Statuses record what is actually possible today.
-- ---------------------------------------------------------------------------
with matrix(name, slug, status, website, directory, catalog, store_products,
            inventory, pricing, aisles, store_map, public_api, partner_api,
            approval, api_name, api_url, source, notes) as (
  values
    ('Kroger', 'kroger', 'development', 'https://www.kroger.com',
     true, true, true, true, true, true, false, true, false, false,
     'Kroger Products + Locations API', 'https://developer.kroger.com',
     'https://developer-ce.kroger.com/api-products/api/product-api-public',
     'Only major US retailer whose public API exposes per-store aisle locations and stock; free self-service OAuth2. Adapter planned, not yet built.'),
    ('Mariano''s', 'marianos', 'development', 'https://www.marianos.com',
     true, true, true, true, true, true, false, true, false, false,
     'Kroger Products + Locations API (Kroger banner)', 'https://developer.kroger.com',
     'https://developer-ce.kroger.com/api-products/api/product-api-public',
     'Kroger banner; served by the same Kroger API integration once built.'),
    ('Walmart', 'walmart', 'partnership_required', 'https://www.walmart.com',
     true, true, false, false, false, false, false, true, true, true,
     'Walmart affiliate/marketplace APIs', 'https://developer.walmart.com',
     'https://developer.walmart.com',
     'Official APIs cover affiliate catalog/marketplace selling only — no store-specific aisle or inventory data without a partnership.'),
    ('Target', 'target', 'partnership_required', 'https://www.target.com',
     true, false, false, false, false, false, false, false, true, true,
     null, null, 'https://partners.target.com',
     'Partner-only APIs; the internal "redsky" API is unauthorized for third parties.'),
    ('Jewel-Osco', 'jewel-osco', 'partnership_required', 'https://www.jewelosco.com',
     true, false, false, false, false, false, false, false, true, true,
     null, null, 'https://www.albertsonscompanies.com',
     'Albertsons banner; official APIs are ad-measurement only — no catalog/location data path without partnership.'),
    ('Meijer', 'meijer', 'partnership_required', 'https://www.meijer.com',
     false, false, false, false, false, false, false, false, true, true,
     null, 'https://apiportal.meijer.com/', 'https://apiportal.meijer.com/',
     'API portal exists but requires Meijer-issued credentials; supplier EDI only.'),
    ('Aldi', 'aldi', 'unsupported', 'https://www.aldi.us',
     false, false, false, false, false, false, false, false, false, false,
     null, null, 'https://www.aldi.us/terms-of-use',
     'No developer or partner data program; ToS bans automated extraction.'),
    ('Costco', 'costco', 'unsupported', 'https://www.costco.com',
     false, false, false, false, false, false, false, false, false, false,
     null, null, 'https://www.costco.com/terms-and-conditions-of-use.html',
     'API portal is internal-only; marketed "Costco APIs" are unofficial scrapers — never used.'),
    ('Sam''s Club', 'sams-club', 'unsupported', 'https://www.samsclub.com',
     false, false, false, false, false, false, false, false, true, true,
     'Sam''s Club MAP (advertisers only)', 'https://developer.samsclub.com/',
     'https://developer.samsclub.com/',
     'Official APIs serve advertisers only; no product-locator data channel.'),
    ('Walgreens', 'walgreens', 'development', 'https://www.walgreens.com',
     true, false, true, true, false, false, false, true, false, false,
     'Walgreens Store Inventory + Locator API', 'https://developer.walgreens.com',
     'https://developer.walgreens.com',
     'Official program with store inventory (availability, no aisles); API key application required.'),
    ('CVS', 'cvs', 'directory_only', 'https://www.cvs.com',
     true, false, false, false, false, false, false, true, true, true,
     'CVS Health Developer Portal', 'https://developer.cvshealth.com/',
     'https://developer.cvshealth.com/apis',
     'Real developer portal, but pharmacy/health APIs plus a store locator — no retail catalog or shelf data.'),
    ('Home Depot', 'home-depot', 'partnership_required', 'https://www.homedepot.com',
     true, false, false, false, false, false, false, false, false, true,
     null, null, 'https://www.homedepot.com',
     'No public developer program; partnership required for any data access.'),
    ('Lowe''s', 'lowes', 'development', 'https://www.lowes.com',
     true, true, true, true, true, false, false, true, true, false,
     'Lowe''s Developer Portal', 'https://portal.apim.lowes.com/',
     'https://developer.lowes.com/portal',
     'Official APIM portal advertises self-serve keys with product/inventory/pricing/store APIs (no aisles); specs behind login — validate before live.'),
    ('Menards', 'menards', 'unsupported', 'https://www.menards.com',
     false, false, false, false, false, false, false, false, false, false,
     null, null, 'https://www.menards.com',
     'No developer portal, partner API, or feed program of any kind.'),
    ('Ace Hardware', 'ace-hardware', 'import_supported', 'https://www.acehardware.com',
     false, false, false, false, false, false, false, false, false, false,
     null, null, 'https://www.acehardware.com/terms-of-use',
     'No data API, but independently owned stores can supply store-managed CSV imports.'),
    ('Best Buy', 'best-buy', 'unsupported', 'https://www.bestbuy.com',
     true, true, false, false, false, false, false, true, false, false,
     'Best Buy Developer API (restricted)', 'https://bestbuyapis.github.io',
     'https://bestbuyapis.github.io',
     'API keys restricted; no aisle data even for approved keys.'),
    ('Staples', 'staples', 'partnership_required', 'https://www.staples.com',
     false, true, false, false, true, false, false, false, true, true,
     'Staples Business Advantage eProcurement', 'https://www.staplesadvantage.com/learn/eprocurement-integrations',
     'https://www.staplesadvantage.com/learn/eprocurement-integrations',
     'B2B punchout/EDI/REST under contract; catalog + contract pricing, no store stock or aisles.'),
    ('Office Depot', 'office-depot', 'partnership_required', 'https://www.officedepot.com',
     false, true, false, false, true, false, false, false, true, true,
     null, 'https://www.odpbusiness.com/', 'https://www.odpbusiness.com/',
     'B2B punchout/EDI via ODP Business Solutions under negotiated account.'),
    ('PetSmart', 'petsmart', 'partnership_required', 'https://www.petsmart.com',
     false, true, false, false, true, false, false, false, true, true,
     'PetSmart affiliate feeds (FlexOffers)', 'https://www.petsmart.com/affiliates/',
     'https://www.petsmart.com/affiliates/',
     'Affiliate product feeds (catalog + pricing) are the only official channel; no store availability or aisles.'),
    ('Petco', 'petco', 'unsupported', 'https://www.petco.com',
     false, false, false, false, false, false, false, false, false, false,
     null, null, 'https://advertising.petco.com/terms-of-use/',
     'Internal-only APIs; partner channels expose no product-locator data.'),
    ('Whole Foods Market', 'whole-foods', 'unsupported', 'https://www.wholefoodsmarket.com',
     false, false, false, false, false, false, false, false, false, false,
     null, null, 'https://www.wholefoodsmarket.com/legal/terms-use',
     'No developer/partner data program; ToS forbids extraction of listings, prices, images.')
),
inserted as (
  insert into retailers (name, slug, integration_status, website_url)
  select m.name, m.slug, m.status, m.website from matrix m
  returning id, slug
)
insert into retailer_capabilities
  (retailer_id, store_directory, product_catalog, store_specific_products,
   inventory, pricing, aisle_locations, store_map, official_public_api,
   partner_api, commercial_approval_required, api_name, api_url,
   official_source_url, notes, last_reviewed_at)
select i.id, m.directory, m.catalog, m.store_products, m.inventory, m.pricing,
       m.aisles, m.store_map, m.public_api, m.partner_api, m.approval,
       m.api_name, m.api_url, m.source, m.notes, '2026-08-06T00:00:00Z'
from matrix m
join inserted i on i.slug = m.slug;

-- ---------------------------------------------------------------------------
-- Provider registry
-- ---------------------------------------------------------------------------
insert into providers (slug, name, kind, retailer_id, enabled, notes) values
  ('mock-demo-catalog', 'Bundled demo catalog', 'MOCK', null, true,
   'Ships with the app; used when Supabase is unconfigured and in tests.'),
  ('store-managed-portal', 'Store-managed data', 'STORE_MANAGED',
   'd94f2a10-4b3c-4a2e-8f6d-2e7b9c051a33', true,
   'Store staff maintain catalog and locations via imports/portal.'),
  ('csv-import', 'CSV catalog import', 'CSV_IMPORT', null, true,
   'Spreadsheet/CSV ingestion via the catalog-import Edge Function.'),
  ('kroger-api', 'Kroger Products API', 'RETAILER_API', null, false,
   'Self-service OAuth2; enable after registering at developer.kroger.com.');

insert into provider_capabilities
  (provider_id, store_directory, product_catalog, store_specific_products,
   inventory, pricing, aisle_locations, store_map)
select id,
       kind in ('RETAILER_API'),
       true,
       true,
       kind in ('RETAILER_API', 'STORE_MANAGED', 'CSV_IMPORT', 'MOCK'),
       kind in ('RETAILER_API', 'STORE_MANAGED', 'CSV_IMPORT', 'MOCK'),
       kind in ('RETAILER_API', 'STORE_MANAGED', 'CSV_IMPORT', 'MOCK'),
       false
from providers;

commit;
