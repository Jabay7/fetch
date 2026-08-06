-- Fetch demo seed. Mirrors src/data/mock/data.ts so the Supabase provider
-- reproduces every scenario the mock provider's tests cover, including:
-- Colgate Total at Schaumburg = Aisle G18 / Oral Care / in stock, different
-- aisles per store, an out-of-stock item, an item with no aisle data, and an
-- item carried only at Naperville. Run after the init migration.

begin;

insert into departments (name) values
  ('Health & Beauty'),
  ('Grocery'),
  ('Produce'),
  ('Meat & Seafood'),
  ('Household'),
  ('Pharmacy'),
  ('Pets');

insert into stores (id, name, chain, address_line, city, state, zip) values
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Schaumburg Main Store', 'Fetch Market', '601 E Golf Rd', 'Schaumburg', 'IL', '60173'),
  ('9c858901-8a57-4791-81fe-4c455b099bc9', 'Naperville West Store', 'Fetch Market', '1550 N Route 59', 'Naperville', 'IL', '60563'),
  ('16fd2706-8baf-433b-82eb-8c7fada847da', 'Evanston Central Store', 'Fetch Market', '1111 Chicago Ave', 'Evanston', 'IL', '60202');

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
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, updated_at)
select sp.id, a.id, l.bay, l.shelf, l.section, d.id, l.updated_at::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
left join aisles a on a.store_id = sp.store_id and a.code = l.aisle
left join departments d on d.name = l.department;

-- ---------------------------------------------------------------------------
-- Naperville West Store (same products, different aisles; carries the
-- charcoal toothpaste Schaumburg doesn't; Duracell has UNKNOWN stock)
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
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, updated_at)
select sp.id, a.id, l.bay, l.shelf, l.section, d.id, l.updated_at::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '9c858901-8a57-4791-81fe-4c455b099bc9'
left join aisles a on a.store_id = sp.store_id and a.code = l.aisle
left join departments d on d.name = l.department;

-- ---------------------------------------------------------------------------
-- Evanston Central Store (small format, third aisle naming scheme)
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

with locations(upc, aisle, bay, shelf, section, department, updated_at) as (
  values
    ('0003500046013', 'B7', null, '1', 'Oral Care', 'Health & Beauty', '2026-08-03 13:00:00+00'),
    ('0031015806321', 'B7', null, '2', 'Oral Care', 'Health & Beauty', '2026-08-03 13:00:00+00'),
    ('0031254742735', 'B7', null, '4', 'Oral Care', 'Health & Beauty', '2026-08-05 09:30:00+00'),
    ('0001111041600', 'A2', null, null, 'Dairy', 'Grocery', '2026-08-05 06:00:00+00'),
    ('0007294560021', 'A4', null, null, 'Bread & Bakery', 'Grocery', '2026-08-03 07:30:00+00'),
    ('0001600027528', 'C1', null, null, 'Cereal & Breakfast', 'Grocery', '2026-08-02 10:00:00+00'),
    ('0003700000445', 'D5', null, null, 'Laundry & Cleaning', 'Household', '2026-08-02 10:00:00+00'),
    ('0030573015401', 'B9', null, null, 'First Aid', 'Pharmacy', '2026-08-02 10:00:00+00')
)
insert into product_locations (store_product_id, aisle_id, bay, shelf, section, department_id, updated_at)
select sp.id, a.id, l.bay, l.shelf, l.section, d.id, l.updated_at::timestamptz
from locations l
join products p on p.upc = l.upc
join store_products sp on sp.product_id = p.id
  and sp.store_id = '16fd2706-8baf-433b-82eb-8c7fada847da'
left join aisles a on a.store_id = sp.store_id and a.code = l.aisle
left join departments d on d.name = l.department;

commit;
