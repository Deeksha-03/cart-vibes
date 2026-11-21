import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { verifyRazorpaySignature } from './payment-utils.js';
import { resolveShoppingAction } from './shopping-actions.js';

const require = createRequire(import.meta.url);
const { ConvoAITokenBuilder, RtcTokenBuilder, RtcRole, RtmTokenBuilder } = require('agora-token');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;

const products = [
  { id: 'p1', name: 'CloudSoft Everyday Sneakers', category: 'Footwear', price: 2499, oldPrice: 3299, rating: 4.8, reviews: 248, tag: 'Bestseller', color: 'lilac', emoji: '👟', description: 'Lightweight cushioning for everyday walks.', stock: 18 },
  { id: 'p2', name: 'Aura Wireless Headphones', category: 'Tech', price: 3199, oldPrice: 3999, rating: 4.7, reviews: 186, tag: 'Top rated', color: 'peach', emoji: '🎧', description: 'Comfort-fit headphones with rich, balanced sound.', stock: 12 },
  { id: 'p3', name: 'Everyday Mini Tote', category: 'Accessories', price: 1299, oldPrice: 1799, rating: 4.9, reviews: 92, tag: 'New', color: 'sage', emoji: '👜', description: 'A compact, versatile tote for daily essentials.', stock: 24 },
  { id: 'p4', name: 'Glow Desk Lamp', category: 'Home', price: 1899, oldPrice: 2399, rating: 4.6, reviews: 115, tag: 'Staff pick', color: 'butter', emoji: '💡', description: 'Warm dimmable lighting for your desk or bedside.', stock: 9 },
  { id: 'p5', name: 'MoveLite Yoga Mat', category: 'Wellness', price: 999, oldPrice: 1399, rating: 4.7, reviews: 301, tag: 'Great value', color: 'blue', emoji: '🧘', description: 'Grippy, supportive mat for daily movement.', stock: 31 },
  { id: 'p6', name: 'Hydra Steel Bottle', category: 'Lifestyle', price: 799, oldPrice: 1099, rating: 4.5, reviews: 164, tag: 'Popular', color: 'rose', emoji: '🥤', description: 'Insulated bottle that keeps drinks cool for hours.', stock: 0 }
];
const cart = new Map();
const orders = new Map();
const pendingPaymentOrders = new Map();
const preparedVoiceSessions = new Map();
const voiceTranscripts = new Map();
let pendingPaymentOrderId = null;

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CartVibes API' }));
app.get('/api/products', (_req, res) => res.json({ products }));
app.get('/api/cart', (_req, res) => res.json({ cart: cartSnapshot() }));
app.get('/api/orders', (_req, res) => res.json({
  orders: [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}));
app.post('/api/cart/items', (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  const result = addCartItem(productId, quantity);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ cart: result.cart });
});
app.patch('/api/cart/items/:id', (req, res) => {
  if (pendingPaymentOrderId) return res.status(409).json({ error: 'Finish or retry the pending test payment before changing your bag.' });
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const quantity = Number(req.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: 'Quantity must be a whole number of zero or more.' });
  }
  if (quantity > product.stock) return res.status(409).json({ error: 'Not enough stock.' });
  if (quantity === 0) cart.delete(product.id); else cart.set(product.id, quantity);
  res.json({ cart: cartSnapshot() });
});
app.post('/api/coupons/apply', (req, res) => {
  if (pendingPaymentOrderId) return res.status(409).json({ error: 'Finish or retry the pending test payment before changing your bag.' });
  const code = String(req.body?.code || '').trim().toUpperCase();
  const subtotal = Math.max(0, Number(req.body?.subtotal) || 0);
  if (code !== 'VIBE10') return res.status(400).json({ error: 'That code did not work. Try VIBE10.' });
  if (subtotal <= 0) return res.status(400).json({ error: 'Add something to your bag first.' });
  res.json({ code, discount: Math.round(subtotal * 0.10), message: 'VIBE10 applied — 10% off.' });
});
app.post('/api/checkout', (req, res) => {
  if (pendingPaymentOrderId) return res.status(409).json({ error: 'Finish or retry the pending test payment before placing another order.' });
  const snapshot = checkoutSnapshot(req.body?.coupon);
  if (snapshot.error) return res.status(snapshot.status).json({ error: snapshot.error });
  const order = completeOrder(snapshot, 'SANDBOX');
  res.status(201).json({ order });
});
app.get('/api/payments/razorpay/status', (_req, res) => {
  res.json({ enabled: isRazorpayTestConfigured() });
});
app.post('/api/payments/razorpay/order', async (req, res) => {
  if (!isRazorpayTestConfigured()) {
    return res.status(503).json({ error: 'Razorpay test mode is not configured. Add test-mode credentials to the server environment.' });
  }

  if (pendingPaymentOrderId) {
    const pending = pendingPaymentOrders.get(pendingPaymentOrderId);
    if (pending) {
      return res.json({
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: pendingPaymentOrderId,
        amount: pending.total * 100,
        currency: 'INR'
      });
    }
    pendingPaymentOrderId = null;
  }

  const snapshot = checkoutSnapshot(req.body?.coupon);
  if (snapshot.error) return res.status(snapshot.status).json({ error: snapshot.error });
  if (!Number.isSafeInteger(snapshot.total * 100) || snapshot.total <= 0) {
    return res.status(400).json({ error: 'The cart total is not a valid Razorpay payment amount.' });
  }

  const receipt = 'cv_' + crypto.randomBytes(12).toString('hex');
  try {
    const upstream = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount: snapshot.total * 100, currency: 'INR', receipt })
    });
    const responseText = await upstream.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }
    if (!upstream.ok || typeof data.id !== 'string') {
      console.error('Razorpay test order creation failed:', upstream.status, data.error?.description || data.message);
      return res.status(502).json({ error: 'Razorpay could not create a test payment order.' });
    }

    pendingPaymentOrderId = data.id;
    pendingPaymentOrders.set(data.id, { ...snapshot, receipt });
    return res.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency
    });
  } catch (error) {
    console.error('Razorpay test order request failed:', error);
    return res.status(502).json({ error: 'Could not connect to Razorpay test mode.' });
  }
});
app.post('/api/payments/razorpay/verify', async (req, res) => {
  if (!isRazorpayTestConfigured()) {
    return res.status(503).json({ error: 'Razorpay test mode is not configured.' });
  }

  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');
  const pending = pendingPaymentOrders.get(orderId);
  if (!pending || orderId !== pendingPaymentOrderId) {
    return res.status(404).json({ error: 'This Razorpay test order is no longer available.' });
  }
  if (!verifyRazorpaySignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) {
    return res.status(400).json({ error: 'Razorpay payment verification failed.' });
  }

  try {
    const upstream = await fetch('https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId), {
      headers: {
        Authorization: 'Basic ' + Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64')
      }
    });
    const responseText = await upstream.text();
    let payment = {};
    try { payment = responseText ? JSON.parse(responseText) : {}; } catch { payment = {}; }
    if (!upstream.ok) {
      console.error('Razorpay payment status lookup failed:', upstream.status, payment.error?.description || payment.message);
      return res.status(502).json({ error: 'Could not confirm the Razorpay test payment status.' });
    }
    if (
      payment.order_id !== orderId ||
      payment.amount !== pending.total * 100 ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    ) {
      return res.status(409).json({ error: 'The Razorpay test payment is not captured for the expected amount.' });
    }

    const currentItems = cartSnapshot();
    const cartUnchanged = currentItems.length === pending.items.length &&
      pending.items.every(item => currentItems.some(current => current.id === item.id && current.quantity === item.quantity));
    if (!cartUnchanged) return res.status(409).json({ error: 'Your bag changed during payment. Contact support before retrying.' });
    const unavailable = pending.items.find(item => {
      const product = products.find(p => p.id === item.id);
      return !product || item.quantity > product.stock;
    });
    if (unavailable) return res.status(409).json({ error: unavailable.name + ' no longer has enough stock.' });

    const order = completeOrder(pending, 'RAZORPAY_TEST', paymentId);
    pendingPaymentOrders.delete(orderId);
    pendingPaymentOrderId = null;
    return res.json({ order });
  } catch (error) {
    console.error('Razorpay payment verification request failed:', error);
    return res.status(502).json({ error: 'Could not verify the Razorpay test payment.' });
  }
});
app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
});
function buildAssistantResponse(body = {}) {
  const message = String(body.message || '').trim();
  if (!message) return { error: 'Please say or type what you are looking for.' };
  const language = body.language === 'kn-IN' ? 'kn-IN' : 'en-IN';
  const lower = message.toLowerCase();
  const budgetMatch = lower.match(/(?:under|below|less than|within|budget(?: of)?|₹|rs\.?\s*)(?:₹\s*)?([\d,]+)/i);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : null;
  let matches = products.filter(p => p.stock > 0);
  if (budget) matches = matches.filter(p => p.price <= budget);
  const keywords = [
    { words: ['shoe', 'sneaker', 'walking', 'footwear'], category: 'Footwear' },
    { words: ['headphone', 'audio', 'music', 'earphone'], category: 'Tech' },
    { words: ['bag', 'tote', 'purse'], category: 'Accessories' },
    { words: ['desk', 'lamp', 'light'], category: 'Home' },
    { words: ['yoga', 'fitness', 'workout', 'mat'], category: 'Wellness' },
    { words: ['bottle', 'drink', 'ಬಾಟಲಿ'], category: 'Lifestyle' },
    { words: ['ಶೂ', 'ಚಪ್ಪಲಿ', 'ಸ್ನೀಕರ್'], category: 'Footwear' },
    { words: ['ಹೆಡ್‌ಫೋನ್', 'ಕಿವಿಫೋನ್', 'ಸಂಗೀತ'], category: 'Tech' },
    { words: ['ಚೀಲ', 'ಬ್ಯಾಗ್'], category: 'Accessories' },
    { words: ['ಮೇಜು', 'ದೀಪ'], category: 'Home' },
    { words: ['ಯೋಗ', 'ವ್ಯಾಯಾಮ', 'ಮ್ಯಾಟ್'], category: 'Wellness' }
  ];
  const matchedCategories = keywords.filter(k => k.words.some(word => lower.includes(word))).map(k => k.category);
  if (matchedCategories.length) matches = matches.filter(p => matchedCategories.includes(p.category));
  const comparing = /\b(compare|comparison|cheaper|price)\b/.test(lower) || /ಹೋಲಿಸು|ಹೋಲಿಸಿ|ಬೆಲೆ/.test(lower);
  const suggestedProductIds = Array.isArray(body.conversationContext?.suggestedProductIds)
    ? body.conversationContext.suggestedProductIds.filter(id => typeof id === 'string').slice(0, 3)
    : [];
  const suggestedProducts = suggestedProductIds
    .map(id => products.find(product => product.id === id))
    .filter(product => product && product.stock > 0);
  const resolution = resolveShoppingAction({
    message,
    matches,
    suggestedProducts,
    cartItems: cartSnapshot()
  });
  let action = null;
  let reply;
  const couponIntent = /\b(coupon|discount|promo|code|vibe10)\b/.test(lower) || /ಕೂಪನ್|ರಿಯಾಯಿತಿ|ಡಿಸ್ಕೌಂಟ್/.test(lower);
  const cartIntent = /\bcart\b|\bmy bag\b|\bshopping bag\b/.test(lower) || /ಕಾರ್ಟ್/.test(lower);
  const showOrdersIntent = /\b(show|view|track|check|list)\b.*\borders?\b|\border history\b|\bwhat (?:are|is) (?:my|the) orders?\b/.test(lower) ||
    /ಆರ್ಡರ್.*(ತೋರಿಸು|ನೋಡು|ಸ್ಥಿತಿ)/.test(lower);
  if (resolution?.intent === 'add' && resolution.action) {
    action = resolution.action;
    reply = language === 'kn-IN' ? 'ಖಂಡಿತ! ಈಗ ನಿಮ್ಮ ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸುತ್ತಿದ್ದೇನೆ.' : 'I’ll add that now and confirm once it is in your bag.';
  } else if (resolution?.intent === 'add') {
    reply = matches.length
      ? language === 'kn-IN'
        ? 'ಯಾವ ಉತ್ಪನ್ನವನ್ನು ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಬೇಕು? ಉತ್ಪನ್ನದ ಹೆಸರನ್ನು ಹೇಳಿ.'
        : 'Which product should I add? Please say its name.'
      : language === 'kn-IN'
        ? 'ನಿಮ್ಮ ಆಯ್ಕೆಗೆ ಹೊಂದುವ ಉತ್ಪನ್ನ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಉತ್ಪನ್ನವನ್ನು ಪ್ರಯತ್ನಿಸೋಣವೇ?'
        : 'I could not find an in-stock match to add. Want to try another product?';
  } else if (couponIntent) {
    action = { type: 'apply_coupon', code: 'VIBE10' };
    reply = language === 'kn-IN' ? 'ನಿಮ್ಮ ಕಾರ್ಟ್‌ಗೆ VIBE10 ಕೂಪನ್ ಅನ್ವಯಿಸಬಹುದು.' : 'I can apply our demo code VIBE10 for 10% off your bag.';
  } else if (cartIntent && (/\b(show|open|check|what|view)\b/.test(lower) || /ತೋರಿಸು|ತೆರೆ|ನೋಡು/.test(lower))) {
    action = { type: 'show_cart' };
    reply = language === 'kn-IN' ? 'ಖಂಡಿತ — ನಿಮ್ಮ ಕಾರ್ಟ್ ತೆರೆಯುತ್ತಿದ್ದೇನೆ.' : 'Of course — let me pull up your bag.';
  } else if (showOrdersIntent) {
    action = { type: 'show_orders' };
    reply = language === 'kn-IN' ? 'ನಿಮ್ಮ ಡೆಮೊ ಆರ್ಡರ್‌ಗಳ ಪಟ್ಟಿಯನ್ನು ತೆರೆಯುತ್ತಿದ್ದೇನೆ.' : 'Here is your sandbox order history.';
  } else if (resolution?.intent === 'order') {
    action = resolution.action;
    reply = action
      ? language === 'kn-IN' ? 'ನಿಮ್ಮ ಆರ್ಡರ್ ಅನ್ನು ಈಗ ಪೂರ್ಣಗೊಳಿಸುತ್ತಿದ್ದೇನೆ.' : 'I’ll place the order now.'
      : language === 'kn-IN' ? 'ನಿಮ್ಮ ಕಾರ್ಟ್ ಖಾಲಿಯಿದೆ. ಮೊದಲು ಯಾವ ಉತ್ಪನ್ನ ಬೇಕೆಂದು ಹೇಳಿ.' : 'Your bag is empty. Tell me which product you would like to order.';
  } else if (matches.length) {
    reply = language === 'kn-IN'
      ? (comparing
        ? 'ಬೆಲೆ ಹೋಲಿಕೆ: ' + matches.slice(0, 3).map(p => `${p.name} ${p.price.toLocaleString('en-IN')} ರೂಪಾಯಿ`).join('; ')
        : 'ನಿಮ್ಮ ಆಯ್ಕೆಗೆ ಹೊಂದುವ ಉತ್ಪನ್ನಗಳು ಇಲ್ಲಿವೆ. ' + matches[0].name + ' ಬೆಲೆ ' + matches[0].price.toLocaleString('en-IN') + ' ರೂಪಾಯಿ.')
      : (comparing
        ? 'Here is a quick price comparison: ' + matches.slice(0, 3).map(p => `${p.name} at ₹${p.price.toLocaleString('en-IN')}`).join('; ')
        : matchedCategories.length
          ? 'I found ' + matches.length + ' matching option(s)' + (budget ? ' within ₹' + budget.toLocaleString('en-IN') : '') + '. My top match is ' + matches[0].name + ' for ₹' + matches[0].price.toLocaleString('en-IN') + '.'
          : 'Here are a few lovely options. ' + matches[0].name + ' is a great place to start at ₹' + matches[0].price.toLocaleString('en-IN') + '.');
  } else {
    reply = language === 'kn-IN'
      ? 'ಆ ಬೆಲೆಯಲ್ಲಿ ಸ್ಟಾಕ್‌ನಲ್ಲಿರುವ ಉತ್ಪನ್ನ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಬೆಲೆ ಅಥವಾ ವರ್ಗ ಪ್ರಯತ್ನಿಸಬೇಕೇ?'
      : 'I could not find an in-stock match at that price. Want to try a different budget or category?';
  }
  return { reply, products: matches.slice(0, 3), action, intent: resolution?.intent || null };
}

app.post('/api/assistant', (req, res) => {
  const response = buildAssistantResponse(req.body);
  if (response.error) return res.status(400).json({ error: response.error });
  res.json(response);
});

app.post('/api/voice/transcript', (req, res) => {
  const sessionKey = String(req.body?.sessionKey || '');
  const prepared = preparedVoiceSessions.get(sessionKey);
  if (!prepared) return res.status(404).json({ error: 'The voice session is no longer active. Start a new call.' });

  const message = String(req.body?.message || '').trim();
  const turnId = req.body?.turnId;
  if (!message || turnId === undefined || turnId === null) {
    return res.status(400).json({ error: 'A transcript and turn ID are required.' });
  }

  const turns = voiceTranscripts.get(sessionKey) || [];
  const existing = turns.find(turn => turn.transcript.turnId === String(turnId));
  if (existing) return res.json(existing);

  const response = buildAssistantResponse({
    message,
    language: prepared.language,
    conversationContext: req.body?.conversationContext
  });
  if (response.error) return res.status(400).json({ error: response.error });
  response.assistantInvoked = true;

  if (response.action?.type === 'add_to_cart') {
    const added = addCartItem(response.action.productId, response.action.quantity);
    const product = products.find(item => item.id === response.action.productId);
    const actionResult = added.error
      ? added.error
      : prepared.language === 'kn-IN'
        ? `${product.name} ಅನ್ನು ನಿಮ್ಮ ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿದ್ದೇನೆ.`
        : `I added ${product.name} to your bag.`;
    response.actionHandled = true;
    response.actionSucceeded = !added.error;
    response.actionResult = actionResult;
    response.reply = actionResult;
    response.cart = added.cart || cartSnapshot();
  }

  const result = {
    ...response,
    transcript: {
      turnId: String(turnId),
      text: message,
      receivedAt: new Date().toISOString()
    }
  };
  turns.push(result);
  if (turns.length > 100) turns.shift();
  voiceTranscripts.set(sessionKey, turns);
  res.json(result);
});

app.get('/api/voice/transcripts/:sessionKey', (req, res) => {
  const turns = voiceTranscripts.get(String(req.params.sessionKey || ''));
  if (!turns) return res.status(404).json({ error: 'No voice transcript is available for this session.' });
  res.json({ transcripts: turns });
});

function agoraConfigMissing() {
  return ['AGORA_APP_ID', 'AGORA_APP_CERTIFICATE', 'MURF_API_KEY']
    .filter(key => !process.env[key]);
}

function agoraTokenHeaders(token) {
  return {
    Authorization: 'agora token="' + token + '"',
    'Content-Type': 'application/json'
  };
}

function buildConvoAiToken(channel, uid) {
  return ConvoAITokenBuilder.buildToken(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channel,
    String(uid),
    3600,
    3600
  );
}

function buildRtcToken(channel, uid) {
  return RtcTokenBuilder.buildTokenWithUid(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channel,
    uid,
    RtcRole.PUBLISHER,
    3600,
    3600
  );
}

app.get('/api/voice/status', (_req, res) => {
  const missing = agoraConfigMissing();
  res.json({
    agoraConfigured: missing.length === 0,
    missing,
    voiceProvider: 'Agora Conversational AI Platform + Murf Falcon'
  });
});

// Prepare Agora credentials so the browser can subscribe to transcripts before the agent joins.
app.post('/api/voice/agora/session', async (req, res) => {
  const missing = agoraConfigMissing();
  if (missing.length) {
    return res.status(503).json({ error: 'Agora voice is not configured yet.', missing });
  }

  for (const [key, prepared] of preparedVoiceSessions) {
    if (Date.now() - prepared.createdAt > 5 * 60 * 1000) preparedVoiceSessions.delete(key);
  }

  const channel = 'cv-' + crypto.randomBytes(10).toString('hex');
  const language = req.body?.language === 'kn-IN' ? 'kn-IN' : 'en-IN';
  const currentPage = ['home', 'assistant', 'discover', 'how'].includes(req.body?.pageContext?.page)
    ? req.body.pageContext.page
    : 'home';
  const userUid = crypto.randomInt(100000, 999999);
  const agentUid = Number(process.env.AGORA_AGENT_UID || 1002);
  if (!Number.isInteger(agentUid) || agentUid <= 0 || agentUid === userUid) {
    return res.status(500).json({ error: 'AGORA_AGENT_UID must be a positive integer different from the browser UID.' });
  }

  try {
    const userToken = buildRtcToken(channel, userUid);
    const agentToken = buildConvoAiToken(channel, agentUid);
    const rtmToken = RtmTokenBuilder.buildToken(
      process.env.AGORA_APP_ID,
      process.env.AGORA_APP_CERTIFICATE,
      String(userUid),
      3600
    );
    const sessionKey = crypto.randomBytes(24).toString('hex');
    preparedVoiceSessions.set(sessionKey, {
      createdAt: Date.now(),
      channel,
      language,
      currentPage,
      userUid,
      agentUid,
      userToken,
      agentToken
    });

    return res.json({
      sessionKey,
      appId: process.env.AGORA_APP_ID,
      channel,
      token: userToken,
      rtmToken,
      uid: userUid,
      agentUid
    });
  } catch (error) {
    console.error('Agora session preparation failed:', error);
    return res.status(502).json({ error: 'Could not prepare the Agora voice session.' });
  }
});

app.post('/api/voice/agora/session/:sessionKey/start', async (req, res) => {
  const sessionKey = String(req.params.sessionKey || '');
  const prepared = preparedVoiceSessions.get(sessionKey);
  if (!prepared) return res.status(404).json({ error: 'The prepared Agora session expired. Start again.' });
  if (prepared.agentSessionId) return res.status(409).json({ error: 'This Agora session has already been started.' });

  const catalogSummary = products.map(product =>
    `${product.name}: ₹${product.price}, ${product.stock > 0 ? product.stock + ' in stock' : 'out of stock'}`
  ).join('; ');
  const instructions = [
    'You are Vibe, the friendly, voice-first shopping assistant for CartVibes.',
    'Speak naturally and keep responses concise, like a helpful shopping companion.',
    'This is a live voice conversation. Keep listening while the customer speaks, allow them to interrupt you, and do not wait for a text message or push-to-talk turn.',
    'Ask a brief clarifying question when the category, use case, or budget is unclear.',
    prepared.language === 'kn-IN' ? 'Speak natural Kannada. Keep product names as shown.' : 'Speak English.',
    'The customer is currently viewing the ' + prepared.currentPage + ' page.',
    'Never invent products, prices, ratings, discounts, or stock. Use only this sample catalogue: ' + catalogSummary,
    'You cannot modify the storefront yourself. Never claim a cart, coupon, or order action succeeded until you receive a verified storefront result. When asked to act, acknowledge briefly and wait for that result. Never claim real payment or shipping.'
  ].join(' ');
  const greeting = prepared.language === 'kn-IN'
    ? 'ನಮಸ್ಕಾರ! ನಾನು CartVibes‌ನ Vibe. ನಿಮಗೆ ಏನು ಬೇಕು ಎಂದು ಹೇಳಿ, ಒಟ್ಟಿಗೆ ಒಳ್ಳೆಯ ಆಯ್ಕೆಯನ್ನು ಹುಡುಕೋಣ.'
    : "Hey! I'm Vibe from CartVibes. Tell me what you're shopping for, and we'll find something great together.";
  const payload = {
    name: 'cartvibes-' + crypto.randomBytes(8).toString('hex'),
    properties: {
      channel: prepared.channel,
      token: prepared.agentToken,
      agent_rtc_uid: String(prepared.agentUid),
      agent_rtm_uid: String(prepared.agentUid),
      remote_rtc_uids: [String(prepared.userUid)],
      enable_string_uid: false,
      idle_timeout: 120,
      advanced_features: { enable_rtm: true },
      asr: {
        credential_mode: 'managed',
        vendor: 'deepgram',
        language: prepared.language === 'kn-IN' ? 'kn-IN' : (process.env.AGORA_ASR_LANGUAGE || 'en-IN'),
        params: {
          url: 'wss://api.deepgram.com/v1/listen',
          model: process.env.AGORA_ASR_MODEL || 'nova-3',
          language: prepared.language === 'kn-IN' ? 'kn' : (process.env.AGORA_ASR_LANGUAGE || 'en-IN')
        }
      },
      llm: {
        credential_mode: 'managed',
        vendor: 'openai',
        style: 'openai',
        url: 'https://api.openai.com/v1/chat/completions',
        system_messages: [{ role: 'system', content: instructions }],
        max_history: 32,
        greeting_message: greeting,
        greeting_configs: { mode: 'single_every' },
        failure_message: 'Sorry, I could not complete that. Please try again.',
        params: { model: process.env.AGORA_LLM_MODEL || 'gpt-4o-mini', stream: true }
      },
      tts: {
        credential_mode: 'byok',
        vendor: 'murf',
        params: {
          api_key: process.env.MURF_API_KEY,
          base_url: 'wss://global.api.murf.ai/v1/speech/stream-input',
          voiceId: prepared.language === 'kn-IN' ? 'Neeta' : (process.env.MURF_VOICE_ID || 'Matthew'),
          locale: prepared.language === 'kn-IN' ? 'kn-IN' : (process.env.MURF_LOCALE || 'en-US'),
          rate: 0,
          pitch: 0,
          model: 'FALCON',
          sample_rate: 24000
        }
      },
      parameters: { data_channel: 'rtm' }
    },
  };

  try {
    const upstream = await fetch(
      'https://api.agora.io/api/conversational-ai-agent/v2/projects/' +
        encodeURIComponent(process.env.AGORA_APP_ID) + '/join',
      {
        method: 'POST',
        headers: agoraTokenHeaders(prepared.agentToken),
        body: JSON.stringify(payload)
      }
    );
    const responseText = await upstream.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { data = { detail: responseText }; }
    if (!upstream.ok) {
      console.error('Agora session start failed:', upstream.status, data);
      return res.status(upstream.status).json({
        error: data.detail || data.message || data.reason || 'Agora could not start the voice session.',
        reason: data.reason
      });
    }

    prepared.agentSessionId = data.agent_id;
    return res.json({ agentSessionId: prepared.agentSessionId, status: data.status });
  } catch (error) {
    console.error('Agora session start request failed:', error);
    return res.status(502).json({ error: 'Could not start the Agora voice session.' });
  }
});

app.post('/api/voice/agora/session/:sessionKey/cancel', (req, res) => {
  preparedVoiceSessions.delete(String(req.params.sessionKey || ''));
  res.json({ cancelled: true });
});

app.post('/api/voice/agora/session/:sessionId/stop', async (req, res) => {
  const missing = ['AGORA_APP_ID', 'AGORA_APP_CERTIFICATE']
    .filter(key => !process.env[key]);
  if (missing.length) return res.status(503).json({ error: 'Agora stop credentials are missing.', missing });

  const sessionId = String(req.params.sessionId || '');
  if (!/^[A-Za-z0-9]{1,64}$/.test(sessionId)) return res.status(400).json({ error: 'Invalid Agora session ID.' });
  const preparedSession = [...preparedVoiceSessions.values()].find(session => session.agentSessionId === sessionId);
  if (!preparedSession) return res.status(404).json({ error: 'The Agora voice session is not active.' });

  try {
    const upstream = await fetch(
      'https://api.agora.io/api/conversational-ai-agent/v2/projects/' +
        encodeURIComponent(process.env.AGORA_APP_ID) + '/agents/' +
        encodeURIComponent(sessionId) + '/leave',
      { method: 'POST', headers: agoraTokenHeaders(preparedSession.agentToken) }
    );
    const responseText = await upstream.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.detail || data.message || data.reason || 'Agora could not stop the session.'
      });
    }
    for (const [key, prepared] of preparedVoiceSessions) {
      if (prepared.agentSessionId === sessionId) preparedVoiceSessions.delete(key);
    }
    return res.json({ stopped: true, agentSessionId: sessionId });
  } catch (error) {
    return res.status(502).json({ error: 'Could not stop the Agora voice session: ' + error.message });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html'), err => {
  if (err) res.status(404).send('CartVibes frontend is not built yet. Run npm run dev.');
}));

function isRazorpayTestConfigured() {
  return /^rzp_test_/.test(process.env.RAZORPAY_KEY_ID || '') &&
    Boolean(process.env.RAZORPAY_KEY_SECRET);
}

function checkoutSnapshot(couponValue) {
  const items = cartSnapshot();
  if (!items.length) return { error: 'Your bag is empty.', status: 400 };
  const unavailable = items.find(item => {
    const product = products.find(p => p.id === item.id);
    return !product || item.quantity > product.stock;
  });
  if (unavailable) return { error: unavailable.name + ' no longer has enough stock.', status: 409 };

  const code = String(couponValue || '').trim().toUpperCase();
  if (code && code !== 'VIBE10') return { error: 'That code did not work. Try VIBE10.', status: 400 };
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = code === 'VIBE10' ? Math.round(subtotal * 0.10) : 0;
  return { items, subtotal, discount, total: subtotal - discount };
}

function completeOrder(snapshot, paymentMode, paymentId = null) {
  const order = {
    id: 'CV-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    items: snapshot.items.map(item => ({ ...item })),
    subtotal: snapshot.subtotal,
    discount: snapshot.discount,
    total: snapshot.total,
    paymentMode,
    ...(paymentId ? { paymentId } : {})
  };
  orders.set(order.id, order);
  order.items.forEach(item => {
    const product = products.find(p => p.id === item.id);
    product.stock -= item.quantity;
  });
  cart.clear();
  return order;
}

function cartSnapshot() {
  return [...cart.entries()].map(([id, quantity]) => {
    const product = products.find(p => p.id === id);
    return { ...product, quantity };
  });
}

function addCartItem(productId, quantity = 1) {
  if (pendingPaymentOrderId) {
    return { status: 409, error: 'Finish or retry the pending test payment before changing your bag.' };
  }
  const product = products.find(item => item.id === productId);
  if (!product) return { status: 404, error: 'Product not found.' };
  if (product.stock < 1) return { status: 409, error: 'This item is currently out of stock.' };

  const requestedQuantity = Number(quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    return { status: 400, error: 'Quantity must be a positive whole number.' };
  }
  const current = cart.get(productId) || 0;
  if (current + requestedQuantity > product.stock) {
    return { status: 409, error: 'Only ' + product.stock + ' available.' };
  }

  cart.set(productId, current + requestedQuantity);
  return { cart: cartSnapshot(), product };
}

app.listen(PORT, () => console.log('CartVibes API running on http://localhost:' + PORT));
