import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveShoppingAction } from './shopping-actions.js';

const sneakers = { id: 'p1', stock: 18 };
const tote = { id: 'p3', stock: 24 };

test('resolves "add it" to the latest recommendation', () => {
  const result = resolveShoppingAction({
    message: 'Add it to my cart',
    matches: [sneakers, tote],
    suggestedProducts: [sneakers],
    cartItems: []
  });

  assert.deepEqual(result, {
    intent: 'add',
    action: { type: 'add_to_cart', productId: 'p1', quantity: 1 }
  });
});

test('resolves a referred recommendation when "my bag" matches the accessories category', () => {
  const result = resolveShoppingAction({
    message: 'Put it in my bag',
    matches: [tote],
    suggestedProducts: [sneakers],
    cartItems: []
  });

  assert.deepEqual(result, {
    intent: 'add',
    action: { type: 'add_to_cart', productId: 'p1', quantity: 1 }
  });
});

test('resolves "order it" to a direct order for the recommendation', () => {
  const result = resolveShoppingAction({
    message: 'Order it',
    matches: [sneakers, tote],
    suggestedProducts: [sneakers],
    cartItems: []
  });

  assert.deepEqual(result, {
    intent: 'order',
    action: { type: 'place_order', productId: 'p1', quantity: 1 }
  });
});

test('prefers a specifically named product over the latest recommendation', () => {
  const namedTote = { ...tote, name: 'Everyday Mini Tote' };
  const result = resolveShoppingAction({
    message: 'Add that tote',
    matches: [namedTote],
    suggestedProducts: [sneakers],
    cartItems: []
  });

  assert.deepEqual(result, {
    intent: 'add',
    action: { type: 'add_to_cart', productId: 'p3', quantity: 1 }
  });
});

test('resolves Kannada cart commands to the latest recommendation', () => {
  const result = resolveShoppingAction({
    message: 'ಇದನ್ನು ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ',
    matches: [sneakers, tote],
    suggestedProducts: [tote],
    cartItems: []
  });

  assert.deepEqual(result, {
    intent: 'add',
    action: { type: 'add_to_cart', productId: 'p3', quantity: 1 }
  });
});

test('resolves an order request to checkout when the bag already has items', () => {
  const result = resolveShoppingAction({
    message: 'Place my order',
    matches: [sneakers, tote],
    suggestedProducts: [],
    cartItems: [sneakers]
  });

  assert.deepEqual(result, { intent: 'order', action: { type: 'checkout' } });
});

test('does not guess which product to add when there is no clear reference', () => {
  const result = resolveShoppingAction({
    message: 'Add something to my cart',
    matches: [sneakers, tote],
    suggestedProducts: [],
    cartItems: []
  });

  assert.deepEqual(result, { intent: 'add', action: null });
});
