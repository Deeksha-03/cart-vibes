import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CartVibes API' }));
app.get('/api/products', (_req, res) => res.json({ products }));
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
  const subtotal = Math.max(0, Number(req.body?.subtotal) || 0);
  if (code !== 'VIBE10') return res.status(400).json({ error: 'That code did not work. Try VIBE10.' });
  if (subtotal <= 0) return res.status(400).json({ error: 'Add something to your bag first.' });
  res.json({ code, discount: Math.round(subtotal * 0.10), message: 'VIBE10 applied — 10% off.' });
});
app.post('/api/checkout', (req, res) => {
  const items = cartSnapshot();
  if (!items.length) return res.status(400).json({ error: 'Your bag is empty.' });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = req.body?.coupon === 'VIBE10' ? Math.min(subtotal, Math.max(0, Number(req.body?.discount) || Math.round(subtotal * 0.10))) : 0;
  const order = {
    id: 'CV-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    items,
    subtotal,
    discount,
    total: subtotal - discount,
    paymentMode: 'SANDBOX'
  };
  orders.set(order.id, order);
  cart.clear();
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
            { role: 'system', content: 'You are Vibe, CartVibes shopping assistant. Be warm, concise and honest. Use tools for catalogue searches and all cart actions. Never invent prices or stock. Only recommend in-stock products. This is a sandbox shop; never claim real payment or shipping.' },
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
          const terms = String(args.query || '').toLowerCase().split(/\\s+/).filter(Boolean);
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
  const budgetMatch = lower.match(/(?:under|below|less than|within|budget(?: of)?|₹|rs\\.?\\s*)(?:₹\\s*)?([\\d,]+)/i);
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
  if (/\\b(add|put|include)\\b/.test(lower) && matches.length) {
    action = { type: 'add_to_cart', productId: matches[0].id, quantity: 1 };
    reply = 'On it! I found a match that fits what you asked for.';
  } else if (/\\b(coupon|discount|promo|code)\\b/.test(lower)) {
    action = { type: 'apply_coupon', code: 'VIBE10' };
    reply = 'I can apply our demo code VIBE10 for 10% off your bag.';
  } else if (/\\b(cart|bag)\\b/.test(lower) && /\\b(show|open|check|what|view)\\b/.test(lower)) {
    action = { type: 'show_cart' };
    reply = 'Of course — let me pull up your bag.';
  } else if (/\\b(checkout|buy|purchase|place order)\\b/.test(lower)) {
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
app.get('/api/voice/status', (_req, res) => res.json({
  agoraConfigured: Boolean(process.env.AGORA_APP_ID && process.env.AGORA_CUSTOMER_ID && process.env.AGORA_CUSTOMER_SECRET && process.env.AGORA_CHANNEL && process.env.AGORA_AGENT_TOKEN)
}));
app.post('/api/voice/agora/start', async (_req, res) => {
  const { AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET, AGORA_CHANNEL, AGORA_AGENT_TOKEN, AGORA_PIPELINE_ID } = process.env;
  if (!AGORA_APP_ID || !AGORA_CUSTOMER_ID || !AGORA_CUSTOMER_SECRET || !AGORA_CHANNEL || !AGORA_AGENT_TOKEN || !AGORA_PIPELINE_ID) {
    return res.status(503).json({ error: 'Add Agora credentials and a published AGORA_PIPELINE_ID to .env. Configure Murf Falcon TTS in that Agora Studio agent first.' });
  }
  try {
    const credentials = Buffer.from(AGORA_CUSTOMER_ID + ':' + AGORA_CUSTOMER_SECRET).toString('base64');
    const payload = {
      name: 'cartvibes-' + Date.now(),
      pipeline_id: AGORA_PIPELINE_ID,
      properties: {
        channel: AGORA_CHANNEL,
        token: AGORA_AGENT_TOKEN,
        agent_rtc_uid: process.env.AGORA_AGENT_UID || '1002',
        remote_rtc_uids: [process.env.AGORA_REMOTE_UID || '1001'],
        enable_string_uid: true
      }
    };
    const upstream = await fetch('https://api.agora.io/api/conversational-ai-agent/v2/projects/' + AGORA_APP_ID + '/join', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + credentials, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.message || data.reason || 'Agora could not start the agent.', details: data });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'Could not reach Agora: ' + error.message });
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
