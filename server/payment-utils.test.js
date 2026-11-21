import assert from 'node:assert/strict';
import test from 'node:test';
import { createRazorpaySignature, verifyRazorpaySignature } from './payment-utils.js';

test('accepts a valid Razorpay order signature', () => {
  const signature = createRazorpaySignature('order_test123', 'pay_test456', 'test-secret');

  assert.equal(verifyRazorpaySignature('order_test123', 'pay_test456', signature, 'test-secret'), true);
});

test('rejects a signature for a different order, payment, or secret', () => {
  const signature = createRazorpaySignature('order_test123', 'pay_test456', 'test-secret');

  assert.equal(verifyRazorpaySignature('order_other', 'pay_test456', signature, 'test-secret'), false);
  assert.equal(verifyRazorpaySignature('order_test123', 'pay_other', signature, 'test-secret'), false);
  assert.equal(verifyRazorpaySignature('order_test123', 'pay_test456', signature, 'other-secret'), false);
});

test('rejects malformed signatures', () => {
  assert.equal(verifyRazorpaySignature('order_test123', 'pay_test456', 'not-a-signature', 'test-secret'), false);
});
