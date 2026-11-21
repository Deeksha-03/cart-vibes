import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { ConvoAITokenBuilder } = require('./vendor/agora-token/src/ConvoAITokenBuilder');

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
  { id: 'p6', name: 'Hydra Steel Bottle', category: 'Lifestyle', price: 799, oldPrice: 1099, rating: 4.5, reviews: 164, tag: 'Popular', color: 'rose', emoji: '🥤', description: 'Insulated bottle that keeps drinks cool for hours.', stock: 0 },
  { id: 'p7', name: 'PulseBeat Wireless Headphones', category: 'Tech', price: 2799, oldPrice: 3499, rating: 4.7, reviews: 142, tag: 'Value pick', color: 'blue', emoji: '🎧', description: 'Over-ear wireless headphones with cushioned cups and balanced sound.', stock: 16 },
  { id: 'p8', name: 'SoundNest Bluetooth Earbuds', category: 'Tech', price: 1999, oldPrice: 2599, rating: 4.6, reviews: 98, tag: 'Budget pick', color: 'sage', emoji: '🎵', description: 'Compact Bluetooth earbuds for everyday listening and calls.', stock: 22 }
];
const cart = new Map();
const orders = new Map();
const voiceSessions = new Map();
const checkoutConfirmations = new Map();
let activeCoupon = '';
let activeDiscount = 0;
let latestVoiceOrder = null;

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CartVibes API' }));
app.get('/api/products', (_req, res) => res.json({ products }));
app.get('/api/cart', (_req, res) => res.json(cartSummary()));
app.post('/api/cart/items', (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.stock < 1) return res.status(409).json({ error: 'This item is currently out of stock.' });
  const current = cart.get(productId) || 0;
  if (current + quantity > product.stock) return res.status(409).json({ error: 'Only ' + product.stock + ' available.' });
  cart.set(productId, current + Math.max(1, Number(quantity) || 1));
  res.json({ cart: cartSnapshot() });
});
app.patch('/api/cart/items/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const quantity = Math.max(0, Number(req.body?.quantity) || 0);
  if (quantity > product.stock) return res.status(409).json({ error: 'Not enough stock.' });
  if (quantity === 0) cart.delete(product.id); else cart.set(product.id, quantity);
  res.json({ cart: cartSnapshot() });
});
app.post('/api/coupons/apply', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const subtotal = cartSnapshot().reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (code !== 'VIBE10') return res.status(400).json({ error: 'That code did not work. Try VIBE10.' });
  if (subtotal <= 0) return res.status(400).json({ error: 'Add something to your bag first.' });
  activeCoupon = code;
  activeDiscount = Math.round(subtotal * 0.10);
  res.json({ code, discount: activeDiscount, message: 'VIBE10 applied — 10% off.', ...cartSummary() });
});
app.post('/api/checkout', (req, res) => {
  const items = cartSnapshot();
  if (!items.length) return res.status(400).json({ error: 'Your bag is empty.' });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = activeCoupon === 'VIBE10' ? Math.min(subtotal, activeDiscount || Math.round(subtotal * 0.10)) : 0;
  const order = createDemoOrder(items, activeCoupon, discount);
  orders.set(order.id, order);
  latestVoiceOrder = order;
  cart.clear();
  activeCoupon = '';
  activeDiscount = 0;
  res.status(201).json({ order });
});
app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
});
app.post('/api/assistant', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Please say or type what you are looking for.' });

  // When an LLM key is configured, let the model choose from real shopping tools.
  if (process.env.OPENAI_API_KEY) {
    try {
      const tools = [
        { type: 'function', function: { name: 'search_products', description: 'Search the live product catalogue. Use this for product discovery and recommendations.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_price: { type: 'number' } }, required: ['query'], additionalProperties: false } } },
        { type: 'function', function: { name: 'add_to_cart', description: 'Add a matching in-stock product to the shopping cart when the customer asks to add it.', parameters: { type: 'object', properties: { product_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } }, required: ['product_id'], additionalProperties: false } } },
        { type: 'function', function: { name: 'apply_coupon', description: 'Apply the VIBE10 demo discount when the customer asks for a discount or coupon.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'], additionalProperties: false } } },
        { type: 'function', function: { name: 'view_cart', description: 'Open and summarize the current shopping cart.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
        { type: 'function', function: { name: 'begin_checkout', description: 'Open the cart for customer review before they confirm sandbox checkout. Never place an order without explicit confirmation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }
      ];
      const first = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are Vibe, CartVibes shopping assistant. Be warm, concise and honest. Use tools for catalogue searches and all cart actions. Never invent prices or stock. Only recommend in-stock products. This is a sandbox shop; never claim real payment or shipping. Available catalogue: ' + products.map(p => JSON.stringify({ id: p.id, name: p.name, category: p.category, price: p.price, stock: p.stock })).join('; ') },
            { role: 'user', content: message }
          ],
          tools,
          tool_choice: 'auto'
        })
      });
      const firstData = await first.json();
      if (!first.ok) throw new Error(firstData.error?.message || 'LLM request failed');
      const assistantMessage = firstData.choices?.[0]?.message;
      let matches = [];
      let action = null;
      const toolMessages = [];
      for (const call of assistantMessage?.tool_calls || []) {
        const args = JSON.parse(call.function.arguments || '{}');
        let result = {};
        if (call.function.name === 'search_products') {
          const terms = String(args.query || '').toLowerCase().split(/\s+/).filter(Boolean);
          const maxPrice = Number(args.max_price) || Infinity;
          matches = products.filter(p => p.stock > 0 && p.price <= maxPrice && terms.some(term => (p.name + ' ' + p.category + ' ' + p.description).toLowerCase().includes(term)));
          if (!matches.length) matches = products.filter(p => p.stock > 0 && p.price <= maxPrice);
          result = { products: matches.slice(0, 4) };
        } else if (call.function.name === 'add_to_cart') {
          const product = products.find(p => p.id === args.product_id && p.stock > 0);
          if (product) action = { type: 'add_to_cart', productId: product.id, quantity: Math.max(1, Number(args.quantity) || 1) };
          result = product ? { selected_product: product.name, action: 'add_to_cart' } : { error: 'Product is unavailable.' };
        } else if (call.function.name === 'apply_coupon') {
          action = { type: 'apply_coupon', code: String(args.code || 'VIBE10') };
          result = { action: 'apply_coupon', code: action.code };
        } else if (call.function.name === 'view_cart') {
          action = { type: 'show_cart' };
          result = { items: cartSnapshot() };
        } else if (call.function.name === 'begin_checkout') {
          action = { type: 'checkout' };
          result = { action: 'open_cart_for_confirmation' };
        }
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      let reply = assistantMessage?.content || '';
      if (toolMessages.length) {
        const followup = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are Vibe, a concise and friendly shopping assistant. Describe only the tool results. Do not claim an order or payment has been completed.' },
              { role: 'user', content: message },
              assistantMessage,
              ...toolMessages
            ]
          })
        });
        const followData = await followup.json();
        if (!followup.ok) throw new Error(followData.error?.message || 'LLM follow-up failed');
        reply = followData.choices?.[0]?.message?.content || reply;
      }
      return res.json({ reply: reply || 'I found a few options for you.', products: matches.slice(0, 3), action });
    } catch (error) {
      console.error('LLM assistant fallback:', error.message);
    }
  }

  // Deterministic fallback keeps the prototype usable before an LLM key is added.
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
    { words: ['bottle', 'drink'], category: 'Lifestyle' }
  ];
  const matched = keywords.find(k => k.words.some(word => lower.includes(word)));
  if (matched) matches = matches.filter(p => p.category === matched.category);
  let action = null;
  let reply;
  if (/\b(add|put|include)\b/.test(lower) && matches.length) {
    action = { type: 'add_to_cart', productId: matches[0].id, quantity: 1 };
    reply = 'On it! I found a match that fits what you asked for.';
  } else if (/\b(coupon|discount|promo|code)\b/.test(lower)) {
    action = { type: 'apply_coupon', code: 'VIBE10' };
    reply = 'I can apply our demo code VIBE10 for 10% off your bag.';
  } else if (/\b(cart|bag)\b/.test(lower) && /\b(show|open|check|what|view)\b/.test(lower)) {
    action = { type: 'show_cart' };
    reply = 'Of course — let me pull up your bag.';
  } else if (/\b(checkout|buy|purchase|place order)\b/.test(lower)) {
    action = { type: 'checkout' };
    reply = 'Ready when you are! Review your bag and place the demo order when it looks right.';
  } else if (matches.length) {
    reply = matched
      ? 'I found ' + matches.length + ' ' + matched.category.toLowerCase() + ' pick(s)' + (budget ? ' within ₹' + budget.toLocaleString('en-IN') : '') + '. Here is my top match: ' + matches[0].name + ' for ₹' + matches[0].price.toLocaleString('en-IN') + '.'
      : 'Here are a few lovely options. ' + matches[0].name + ' is a great place to start at ₹' + matches[0].price.toLocaleString('en-IN') + '.';
  } else {
    reply = 'I could not find an in-stock match at that price. Want to try a different budget or category?';
  }
  res.json({ reply, products: matches.slice(0, 3), action });
});


function agoraConfigMissing() {
  return ['AGORA_APP_ID', 'AGORA_APP_CERTIFICATE', 'MURF_API_KEY']
    .filter(key => !process.env[key]);
}

function buildRtcRtmToken(channel, uid) {
  const expiry = 3600;
  return RtcTokenBuilder.buildTokenWithRtm2(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channel,
    Number(uid),
    RtcRole.PUBLISHER,
    expiry,
    expiry,
    expiry,
    expiry,
    expiry,
    String(uid),
    expiry
  );
}

function buildConvoAiToken(channel, uid) {
  return ConvoAITokenBuilder.buildToken(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channel,
    String(uid),
    86400,
    3600
  );
}

function agoraTokenHeaders(token) {
  return {
    Authorization: 'agora token="' + token + '"',
    'Content-Type': 'application/json'
  };
}

function cartSummary() {
  const items = cartSnapshot();
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = activeCoupon === 'VIBE10' ? Math.round(subtotal * 0.10) : 0;
  return {
    cart: items,
    coupon: activeCoupon,
    discount,
    subtotal,
    total: Math.max(0, subtotal - discount),
    latestOrder: latestVoiceOrder
  };
}

function createDemoOrder(items, coupon, discount) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const safeDiscount = Math.max(0, Math.min(subtotal, Number(discount) || 0));
  return {
    id: 'CV-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    items,
    subtotal,
    coupon: coupon || null,
    discount: safeDiscount,
    total: subtotal - safeDiscount,
    paymentMode: 'SANDBOX'
  };
}

function getPublicToolBaseUrl() {
  const value = String(process.env.AGORA_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!value || !process.env.AGORA_TOOL_SHARED_SECRET) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

function buildShoppingTool(name, description, parameters, body, baseUrl) {
  return {
    type: 'function',
    function: { name, description, parameters },
    execution: { mode: 'sync' },
    server: {
      method: 'POST',
      url: baseUrl + '/api/agent-tools/dispatch',
      headers: {
        'X-CartVibes-Tool-Key': '{{template_variables.cartvibes_tool_key}}'
      },
      body,
      timeout_ms: 10000
    }
  };
}

function createShoppingTools(baseUrl) {
  const emptyArgs = { type: 'object', properties: {}, additionalProperties: false };
  return [
    buildShoppingTool(
      'searchProducts',
      'Search the CartVibes catalogue by product type, feature, use case and budget. Use this before recommending products. Return only products actually found and in stock.',
      {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What the customer is looking for, such as headphones, shoes or a desk lamp.' },
          max_price: { type: 'number', description: 'Optional maximum budget in Indian rupees.' }
        },
        required: ['query'],
        additionalProperties: false
      },
      { action: 'searchProducts', query: '{{args.query}}', max_price: '{{args.max_price}}' },
      baseUrl
    ),
    buildShoppingTool(
      'compareProducts',
      'Compare two to four products returned by searchProducts. Compare actual price, discount, rating, stock and description. Do not invent specifications.',
      {
        type: 'object',
        properties: {
          product_ids: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } }
        },
        required: ['product_ids'],
        additionalProperties: false
      },
      { action: 'compareProducts', product_ids: '{{args.product_ids}}' },
      baseUrl
    ),
    buildShoppingTool(
      'addToCart',
      'Add a selected product to the cart only after the customer clearly asks to add it. Check live demo inventory. Never add an out-of-stock item.',
      {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'The product ID returned by searchProducts.' },
          quantity: { type: 'integer', minimum: 1, maximum: 10 }
        },
        required: ['product_id'],
        additionalProperties: false
      },
      { action: 'addToCart', product_id: '{{args.product_id}}', quantity: '{{args.quantity}}' },
      baseUrl
    ),
    buildShoppingTool(
      'applyCoupon',
      'Apply a coupon to the current CartVibes cart. The available demo promotion is VIBE10 for 10 percent off. Do not claim a coupon is applied until this tool confirms it.',
      {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
        additionalProperties: false
      },
      { action: 'applyCoupon', code: '{{args.code}}' },
      baseUrl
    ),
    buildShoppingTool(
      'getCart',
      'Retrieve the current cart, coupon, subtotal, discount and final total. Use this when the customer asks what is in their bag or before checkout.',
      emptyArgs,
      { action: 'getCart' },
      baseUrl
    ),
    buildShoppingTool(
      'prepareCheckout',
      'Prepare a sandbox checkout preview. Read out the products, subtotal, coupon, discount and total. This does not place the order. Return the short-lived confirmation code and ask the customer to explicitly confirm.',
      emptyArgs,
      { action: 'prepareCheckout' },
      baseUrl
    ),
    buildShoppingTool(
      'placeDemoOrder',
      'Place the sandbox order only after the customer explicitly confirms the checkout preview (for example, says yes, confirm or place the order). Use the confirmation code from prepareCheckout. Never infer consent.',
      {
        type: 'object',
        properties: {
          confirmation_code: { type: 'string' },
          user_confirmed: { type: 'boolean' }
        },
        required: ['confirmation_code', 'user_confirmed'],
        additionalProperties: false
      },
      { action: 'placeDemoOrder', confirmation_code: '{{args.confirmation_code}}', user_confirmed: '{{args.user_confirmed}}' },
      baseUrl
    )
  ];
}

function isAuthorizedAgentTool(req) {
  const expected = String(process.env.AGORA_TOOL_SHARED_SECRET || '');
  const supplied = String(req.get('x-cartvibes-tool-key') || '');
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function normalizeProductIds(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return value.split(',').map(part => part.trim()).filter(Boolean);
  }
  return [];
}

app.post('/api/agent-tools/dispatch', (req, res) => {
  if (!isAuthorizedAgentTool(req)) return res.status(401).json({ error: 'Unauthorized shopping tool request.' });
  const action = String(req.body?.action || '');

  if (action === 'searchProducts') {
    const query = String(req.body?.query || '').trim().toLowerCase();
    if (!query) return res.status(400).json({ error: 'A product query is required.' });
    const rawMax = Number(req.body?.max_price);
    const maxPrice = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null;
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = products.filter(product =>
      product.stock > 0 &&
      (!maxPrice || product.price <= maxPrice) &&
      terms.some(term => (product.name + ' ' + product.category + ' ' + product.description).toLowerCase().includes(term))
    ).sort((a, b) => b.rating - a.rating).slice(0, 5);
    return res.json({
      count: matches.length,
      products: matches.map(({ id, name, category, price, oldPrice, rating, reviews, stock, description }) =>
        ({ id, name, category, price, oldPrice, rating, reviews, stock, description })
      )
    });
  }

  if (action === 'compareProducts') {
    const ids = normalizeProductIds(req.body?.product_ids).slice(0, 4);
    if (ids.length < 2) return res.status(400).json({ error: 'Choose at least two catalogue products to compare.' });
    const found = ids.map(id => products.find(product => product.id === id)).filter(Boolean);
    if (found.length !== ids.length) return res.status(404).json({ error: 'One or more products were not found in the catalogue.' });
    return res.json({
      products: found.map(product => ({
        id: product.id, name: product.name, price: product.price, oldPrice: product.oldPrice,
        rating: product.rating, reviews: product.reviews, stock: product.stock,
        description: product.description
      })),
      bestPrice: found.reduce((best, item) => item.price < best.price ? item : best),
      topRated: found.reduce((best, item) => item.rating > best.rating ? item : best)
    });
  }

  if (action === 'addToCart') {
    const productId = String(req.body?.product_id || '');
    const product = products.find(item => item.id === productId);
    if (!product) return res.status(404).json({ error: 'That product was not found.' });
    const quantity = Math.min(10, Math.max(1, Number(req.body?.quantity) || 1));
    if (product.stock < 1) return res.status(409).json({ error: product.name + ' is out of stock.' });
    const current = cart.get(productId) || 0;
    if (current + quantity > product.stock) return res.status(409).json({ error: 'Only ' + product.stock + ' units are available.' });
    cart.set(productId, current + quantity);
    return res.json({ success: true, message: product.name + ' added to the cart.', ...cartSummary() });
  }

  if (action === 'applyCoupon') {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const subtotal = cartSnapshot().reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (code !== 'VIBE10') return res.status(400).json({ error: 'That coupon is not valid. The available demo coupon is VIBE10.' });
    if (subtotal <= 0) return res.status(400).json({ error: 'Add an item to your bag before applying a coupon.' });
    activeCoupon = code;
    activeDiscount = Math.round(subtotal * 0.10);
    return res.json({ success: true, message: 'VIBE10 applied: 10% off.', ...cartSummary() });
  }

  if (action === 'getCart') {
    return res.json({ ...cartSummary() });
  }

  if (action === 'prepareCheckout') {
    const summary = cartSummary();
    if (!summary.cart.length) return res.status(400).json({ error: 'The cart is empty. Find a product and add it first.' });
    const confirmationCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const cartFingerprint = JSON.stringify(summary.cart.map(item => ({ id: item.id, quantity: item.quantity })));
    checkoutConfirmations.set(confirmationCode, {
      cartFingerprint,
      coupon: summary.coupon,
      discount: summary.discount,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    return res.json({
      prepared: true,
      confirmation_code: confirmationCode,
      expires_in_seconds: 300,
      items: summary.cart,
      subtotal: summary.subtotal,
      coupon: summary.coupon,
      discount: summary.discount,
      total: summary.total,
      payment_mode: 'SANDBOX',
      message: 'Preview only. Do not place the order until the customer explicitly confirms.'
    });
  }

  if (action === 'placeDemoOrder') {
    const code = String(req.body?.confirmation_code || '').trim().toUpperCase();
    const confirmed = req.body?.user_confirmed === true || String(req.body?.user_confirmed).toLowerCase() === 'true';
    if (!confirmed) return res.status(403).json({ error: 'Explicit customer confirmation is required before placing the sandbox order.' });
    const prepared = checkoutConfirmations.get(code);
    if (!prepared || prepared.expiresAt < Date.now()) {
      checkoutConfirmations.delete(code);
      return res.status(400).json({ error: 'Checkout confirmation expired. Prepare the checkout summary again.' });
    }
    const currentItems = cartSnapshot();
    const fingerprint = JSON.stringify(currentItems.map(item => ({ id: item.id, quantity: item.quantity })));
    if (!currentItems.length || fingerprint !== prepared.cartFingerprint) {
      checkoutConfirmations.delete(code);
      return res.status(409).json({ error: 'The cart changed after checkout preview. Prepare a fresh summary.' });
    }
    const currentSubtotal = currentItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = prepared.coupon === 'VIBE10' ? Math.min(currentSubtotal, prepared.discount) : 0;
    const order = createDemoOrder(currentItems, prepared.coupon, discount);
    orders.set(order.id, order);
    latestVoiceOrder = order;
    cart.clear();
    activeCoupon = '';
    activeDiscount = 0;
    checkoutConfirmations.delete(code);
    return res.json({ success: true, order, message: 'Sandbox order confirmed. No payment was charged and no real shipment was created.' });
  }

  return res.status(400).json({ error: 'Unknown shopping tool action.' });
});

app.get('/api/voice/status', (_req, res) => {
  const missing = agoraConfigMissing();
  const toolsReady = Boolean(getPublicToolBaseUrl());
  return res.json({
    agoraConfigured: missing.length === 0,
    missing,
    shoppingToolsReady: toolsReady,
    shoppingToolsMissing: toolsReady ? [] : ['AGORA_PUBLIC_BASE_URL (public HTTPS URL)', 'AGORA_TOOL_SHARED_SECRET'],
    voiceProvider: 'Agora Conversational AI Engine · Deepgram Nova-3 · Agora-managed OpenAI · Murf Falcon 2.1',
    supportedLanguages: ['en-IN', 'kn-IN']
  });
});

app.post('/api/voice/agora/prepare', (req, res) => {
  const missing = agoraConfigMissing();
  if (missing.length) return res.status(503).json({ error: 'Agora voice credentials are missing.', missing });

  const channel = 'cartvibes_' + crypto.randomBytes(8).toString('hex');
  const userUid = crypto.randomInt(100000, 999999);
  const sessionId = crypto.randomBytes(16).toString('hex');
  const agentUid = Number(process.env.AGORA_AGENT_UID || 1002);

  if (!Number.isInteger(agentUid) || agentUid <= 0 || agentUid === userUid) {
    return res.status(500).json({ error: 'AGORA_AGENT_UID must be a positive numeric UID.' });
  }

  try {
    const token = buildRtcRtmToken(channel, userUid);
    voiceSessions.set(sessionId, {
      sessionId,
      channel,
      userUid,
      rtmUserId: String(userUid),
      agentUid,
      agentId: null,
      agentToken: null,
      createdAt: Date.now()
    });
    return res.json({
      sessionId,
      appId: process.env.AGORA_APP_ID,
      channel,
      token,
      uid: userUid,
      rtmUserId: String(userUid),
      shoppingToolsReady: Boolean(getPublicToolBaseUrl())
    });
  } catch (error) {
    console.error('Agora session token generation failed:', error);
    return res.status(500).json({ error: 'Could not generate the Agora RTC/RTM token.' });
  }
});

app.post('/api/voice/agora/start', async (req, res) => {
  const missing = agoraConfigMissing();
  if (missing.length) return res.status(503).json({ error: 'Agora voice credentials are missing.', missing });

  const sessionId = String(req.body?.sessionId || '');
  const session = voiceSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Voice session expired. Please reconnect.' });
  if (session.agentId) return res.json({ agentId: session.agentId, status: 'RUNNING' });

  const language = req.body?.language === 'kn-IN' ? 'kn-IN' : 'en-IN';
  const asrLanguage = language === 'kn-IN' ? 'kn' : 'en-IN';
  const voiceId = process.env.MURF_VOICE_ID || 'Neeta';
  const ttsModel = process.env.MURF_MODEL || 'falcon-2.1';
  const ttsStyle = process.env.MURF_STYLE || 'Conversational';
  const ttsLocale = language;
  const toolBaseUrl = getPublicToolBaseUrl();
  const tools = toolBaseUrl ? createShoppingTools(toolBaseUrl) : [];
  const agentToken = buildConvoAiToken(session.channel, session.agentUid);

  const catalogSummary = products.map(product =>
    product.name + ': ₹' + product.price + ', ' +
    (product.stock > 0 ? product.stock + ' in stock' : 'out of stock')
  ).join('; ');

  const languagePrompt = language === 'kn-IN'
    ? 'The selected conversation language is Kannada (India). Understand Kannada and natural Kannada-English code-switching. Speak back in natural Kannada, preferably Kannada script. Product names and model numbers may stay in English when that is clearer.'
    : 'The selected conversation language is Indian English. Speak in clear, natural Indian English.';

  const shoppingPrompt = tools.length
    ? 'You have live CartVibes shopping tools. Search before recommending. Compare only product IDs returned by search. Add only after a clear request. Apply coupons only when asked. Before ordering, prepare checkout, read the complete amount and ask for explicit confirmation. Only place the sandbox order after the customer clearly confirms. Never claim an action succeeded unless the tool result confirms it. This is sandbox checkout only, with no payment or shipping.'
    : 'The shopping tools are not reachable in this environment. You can discuss the sample catalogue but must not claim to change the cart, apply a coupon, or place an order.';

  const systemPrompt = [
    'You are Vibe, a fun, warm, energetic but not pushy shopping companion for CartVibes.',
    languagePrompt,
    'Keep each spoken response natural and concise, usually one or two sentences. Ask one useful question at a time about budget, style or use case.',
    'Never invent product names, prices, stock, discounts or specifications. Use only the catalogue and tool responses.',
    'Sample catalogue: ' + catalogSummary,
    shoppingPrompt,
    'When a tool returns an error, explain it honestly and offer the next useful step. Never expose tool names, API details or secrets.'
  ].join(' ');

  const toolsConfig = tools.length ? {
    template_variables: {
      cartvibes_tool_key: process.env.AGORA_TOOL_SHARED_SECRET
    },
    tools
  } : {};

  const properties = {
    channel: session.channel,
    token: agentToken,
    agent_rtc_uid: String(session.agentUid),
    agent_rtm_uid: String(session.agentUid),
    remote_rtc_uids: [String(session.userUid)],
    enable_string_uid: false,
    idle_timeout: 120,
    advanced_features: {
      enable_rtm: true,
      enable_tools: tools.length > 0
    },
    parameters: {
      data_channel: 'rtm',
      audio_scenario: 'chorus',
      enable_metrics: true,
      enable_error_message: true
    },
    asr: {
      credential_mode: 'managed',
      vendor: 'deepgram',
      params: {
        url: 'wss://api.deepgram.com/v1/listen',
        model: process.env.AGORA_ASR_MODEL || 'nova-3',
        language: asrLanguage
      }
    },
    llm: {
      credential_mode: 'managed',
      vendor: 'openai',
      style: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      params: { model: process.env.AGORA_LLM_MODEL || 'gpt-4o-mini' },
      system_messages: [{ role: 'system', content: systemPrompt }],
      greeting_message: language === 'kn-IN'
        ? 'ನಮಸ್ಕಾರ! ನಾನು ಕಾರ್ಟ್‌ವೈಬ್ಸ್‌ನ ವೈಬ್. ನಿಮಗೆ ಏನು ಬೇಕು ಎಂದು ಹೇಳಿ, ಒಟ್ಟಿಗೆ ಹುಡುಕೋಣ!'
        : "Hey! I'm Vibe from CartVibes. Tell me what you're shopping for, and we'll find something great together.",
      failure_message: language === 'kn-IN'
        ? 'ಕ್ಷಮಿಸಿ, ಈಗ ಸ್ವಲ್ಪ ತೊಂದರೆ ಆಗುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸೋಣವೇ?'
        : "Sorry, I hit a small snag. Could we try that once more?",
      max_history: 40,
      ...toolsConfig
    },
    tts: {
      vendor: 'murf',
      params: {
        api_key: process.env.MURF_API_KEY,
        base_url: process.env.MURF_BASE_URL || 'wss://global.api.murf.ai/v1/speech/stream-input',
        voiceId,
        locale: ttsLocale,
        rate: Number(process.env.MURF_RATE || 0),
        pitch: Number(process.env.MURF_PITCH || 0),
        model: ttsModel,
        style: ttsStyle,
        sample_rate: Number(process.env.MURF_SAMPLE_RATE || 24000)
      }
    }
  };

  const payload = {
    name: 'cartvibes-' + session.sessionId,
    properties
  };

  try {
    const upstream = await fetch(
      'https://api.agora.io/api/conversational-ai-agent/v2/projects/' +
        encodeURIComponent(process.env.AGORA_APP_ID) + '/join',
      {
        method: 'POST',
        headers: agoraTokenHeaders(agentToken),
        body: JSON.stringify(payload)
      }
    );
    const responseText = await upstream.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { data = { detail: responseText }; }

    if (!upstream.ok) {
      console.error('Agora agent start failed:', upstream.status, data);
      return res.status(upstream.status).json({
        error: data.detail || data.message || data.reason || 'Agora failed to start the conversational agent.',
        detail: data
      });
    }

    const agentId = data.agent_id || data.agentId || data.id;
    if (!agentId) {
      console.error('Agora join response did not include agent_id:', data);
      return res.status(502).json({ error: 'Agora started without returning an agent ID.', detail: data });
    }
    session.agentId = agentId;
    session.agentToken = agentToken;
    session.language = language;
    return res.json({ agentId, status: data.status || 'RUNNING', language, shoppingToolsReady: tools.length > 0 });
  } catch (error) {
    console.error('Agora agent start request failed:', error);
    return res.status(502).json({ error: 'Could not start the Agora agent: ' + error.message });
  }
});

app.post('/api/voice/agora/stop', async (req, res) => {
  const sessionId = String(req.body?.sessionId || '');
  const session = voiceSessions.get(sessionId);
  if (!session) return res.json({ stopped: true });

  try {
    if (session.agentId && session.agentToken) {
      const upstream = await fetch(
        'https://api.agora.io/api/conversational-ai-agent/v2/projects/' +
          encodeURIComponent(process.env.AGORA_APP_ID) + '/agents/' +
          encodeURIComponent(session.agentId) + '/leave',
        {
          method: 'POST',
          headers: agoraTokenHeaders(session.agentToken),
          body: JSON.stringify({})
        }
      );
      const responseText = await upstream.text();
      if (!upstream.ok) {
        console.error('Agora agent leave failed:', upstream.status, responseText);
        return res.status(upstream.status).json({ error: 'Agora could not stop the voice agent.', detail: responseText });
      }
    }
    voiceSessions.delete(sessionId);
    return res.json({ stopped: true });
  } catch (error) {
    return res.status(502).json({ error: 'Could not stop the Agora voice agent: ' + error.message });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html'), err => {
  if (err) res.status(404).send('CartVibes frontend is not built yet. Run npm run dev.');
}));

function cartSnapshot() {
  return [...cart.entries()].map(([id, quantity]) => {
    const product = products.find(p => p.id === id);
    return { ...product, quantity };
  });
}
app.listen(PORT, () => console.log('CartVibes API running on http://localhost:' + PORT));
