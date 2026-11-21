import crypto from 'node:crypto';

export function createRazorpaySignature(orderId, paymentId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');
}

export function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    typeof secret !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = Buffer.from(createRazorpaySignature(orderId, paymentId, secret), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
