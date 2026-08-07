import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addListProduct,
  addTextItem,
  getSavedProducts,
  removeSavedProducts,
  setItemQuantity,
} from '../saved-products';
import { parseListText } from '../shopping-list';

const colgate = {
  id: 'p-colgate-total',
  name: 'Colgate Total Toothpaste',
  brand: 'Colgate',
  imageUrl: 'https://img/colgate',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('addListProduct', () => {
  it('adds a product with its image', async () => {
    const list = await addListProduct(colgate);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: colgate.id, imageUrl: 'https://img/colgate' });
  });

  it('bumps quantity instead of duplicating an existing item', async () => {
    await addListProduct(colgate);
    const list = await addListProduct(colgate);
    expect(list).toHaveLength(1);
    expect(list[0].quantity).toBe(2);

    const third = await addListProduct(colgate);
    expect(third[0].quantity).toBe(3);
  });
});

describe('addTextItem', () => {
  it('adds a free-text entry flagged as unmatched', async () => {
    const list = await addTextItem('  birthday   candles ');
    expect(list[0]).toMatchObject({ name: 'birthday candles', isTextItem: true });
  });

  it('ignores empty input', async () => {
    await addTextItem('   ');
    await expect(getSavedProducts()).resolves.toEqual([]);
  });

  it('gives each text item a unique id so duplicates coexist', async () => {
    await addTextItem('bread');
    const list = await addTextItem('bread');
    expect(list).toHaveLength(2);
    expect(list[0].id).not.toBe(list[1].id);
  });
});

describe('setItemQuantity', () => {
  it('clamps to 1..99 and stores 1 as absent', async () => {
    await addListProduct(colgate);
    let list = await setItemQuantity(colgate.id, 5);
    expect(list[0].quantity).toBe(5);

    list = await setItemQuantity(colgate.id, 0);
    expect(list[0].quantity).toBeUndefined();

    list = await setItemQuantity(colgate.id, 500);
    expect(list[0].quantity).toBe(99);
  });

  it('leaves other items untouched', async () => {
    await addListProduct(colgate);
    await addTextItem('bread');
    const list = await setItemQuantity(colgate.id, 3);
    expect(list.find((i) => i.name === 'bread')?.quantity).toBeUndefined();
  });
});

describe('removeSavedProducts', () => {
  it('removes several items at once (clear completed)', async () => {
    await addListProduct(colgate);
    const withText = await addTextItem('bread');
    const textId = withText[0].id;
    const list = await removeSavedProducts([colgate.id, textId]);
    expect(list).toEqual([]);
  });

  it('keeps unchecked items', async () => {
    await addListProduct(colgate);
    await addTextItem('bread');
    const list = await removeSavedProducts([colgate.id]);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('bread');
  });
});

describe('parseListText', () => {
  it('splits newlines, commas, and semicolons', () => {
    expect(parseListText('milk\neggs, bread; butter').map((e) => e.name)).toEqual([
      'milk',
      'eggs',
      'bread',
      'butter',
    ]);
  });

  it('strips bullets and numbering', () => {
    expect(parseListText('- milk\n* eggs\n1. bread\n2) butter').map((e) => e.name)).toEqual([
      'milk',
      'eggs',
      'bread',
      'butter',
    ]);
  });

  it('extracts leading quantities', () => {
    expect(parseListText('2x paper towels\n3 apples\nmilk')).toEqual([
      { name: 'paper towels', quantity: 2 },
      { name: 'apples', quantity: 3 },
      { name: 'milk', quantity: 1 },
    ]);
  });

  it('drops blanks and over-long junk, and caps the batch', () => {
    expect(parseListText('\n\n  \nmilk\n')).toEqual([{ name: 'milk', quantity: 1 }]);
    expect(parseListText('x'.repeat(200))).toEqual([]);
    expect(parseListText(Array.from({ length: 60 }, (_, i) => `item ${i}`).join('\n'))).toHaveLength(25);
  });
});
