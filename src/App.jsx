import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, AudioLines, Check, CheckCircle2, ClipboardList, Heart, Mic,
  MicOff, Minus, Plus, Search, Send, ShoppingBag, Sparkles, Star, Trash2,
  Truck, X
} from 'lucide-react';
import {
  getUserTranscriptItems,
  isFinalTranscript,
  isTranscriptInProgress
} from './agora-transcripts.js';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

async function apiRequest(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Shopping service is unavailable. Run the app with npm run dev and try again.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The shopping service returned an invalid response.');
  }
  if (!response.ok) throw new Error(data.error || 'The shopping request failed.');
  return data;
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  const existing = document.querySelector('script[data-razorpay-checkout]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
}

const starterProducts = [
  { id: 'p1', name: 'CloudSoft Everyday Sneakers', category: 'Footwear', price: 2499, oldPrice: 3299, rating: 4.8, reviews: 248, tag: 'Bestseller', color: 'lilac', emoji: '👟', description: 'Lightweight cushioning for everyday walks.', stock: 18 },
  { id: 'p2', name: 'Aura Wireless Headphones', category: 'Tech', price: 3199, oldPrice: 3999, rating: 4.7, reviews: 186, tag: 'Top rated', color: 'peach', emoji: '🎧', description: 'Comfort-fit headphones with rich, balanced sound.', stock: 12 },
  { id: 'p3', name: 'Everyday Mini Tote', category: 'Accessories', price: 1299, oldPrice: 1799, rating: 4.9, reviews: 92, tag: 'New', color: 'sage', emoji: '👜', description: 'A compact, versatile tote for daily essentials.', stock: 24 },
  { id: 'p4', name: 'Glow Desk Lamp', category: 'Home', price: 1899, oldPrice: 2399, rating: 4.6, reviews: 115, tag: 'Staff pick', color: 'butter', emoji: '💡', description: 'Warm dimmable lighting for your desk or bedside.', stock: 9 },
  { id: 'p5', name: 'MoveLite Yoga Mat', category: 'Wellness', price: 999, oldPrice: 1399, rating: 4.7, reviews: 301, tag: 'Great value', color: 'blue', emoji: '🧘', description: 'Grippy, supportive mat for daily movement.', stock: 31 },
  { id: 'p6', name: 'Hydra Steel Bottle', category: 'Lifestyle', price: 799, oldPrice: 1099, rating: 4.5, reviews: 164, tag: 'Popular', color: 'rose', emoji: '🥤', description: 'Insulated bottle that keeps drinks cool for hours.', stock: 0 }
];

const initialMessages = [
  { role: 'assistant', text: "Hey there! I'm Vibe, your personal shopping buddy. ✨ Tell me what you're looking for, or tap the mic and just say it out loud." },
  { role: 'assistant', text: 'Try: “I need comfy sneakers under ₹2,500” or “Find me a thoughtful desk accessory.”', kind: 'hint' }
];

export default function App() {
  const [products, setProducts] = useState(starterProducts);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState(initialMessages);
  const [agoraTranscript, setAgoraTranscript] = useState([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('en-IN');
  const [pageContext, setPageContext] = useState({ page: 'Home', lastAction: '' });
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notice, setNotice] = useState('');
  const [order, setOrder] = useState(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [agoraCallActive, setAgoraCallActive] = useState(false);
  const [agoraConnecting, setAgoraConnecting] = useState(false);
  const [agoraCallStatus, setAgoraCallStatus] = useState('Not connected');
  const [voicePipelineStatus, setVoicePipelineStatus] = useState('No voice transcript submitted in this session.');
  const chatWindow = useRef(null);
  const transcriptDiagnosticTimerRef = useRef(null);
  const agoraClientRef = useRef(null);
  const agoraMicRef = useRef(null);
  const agoraSessionRef = useRef(null);
  const agoraVoiceAIRef = useRef(null);
  const agoraRtmRef = useRef(null);
  const agoraUserUidRef = useRef(null);
  const agoraAgentUidRef = useRef(null);
  const processedTranscriptTurnsRef = useRef(new Set());
  const pendingTranscriptTurnsRef = useRef(new Set());
  const transcriptStatusesRef = useRef(new Map());
  const stopAfterAgentSpeechRef = useRef(false);
  const heardOrderConfirmationRef = useRef(false);
  const suggestedProductIdsRef = useRef([]);
  const transcriptProductsRef = useRef(new Map());
  const appStateRef = useRef(null);

  const categories = ['All', ...new Set(products.map(p => p.category))];
  const visibleProducts = useMemo(() => products.filter(p => {
    const categoryMatch = activeCategory === 'All' || p.category === activeCategory;
    const term = search.toLowerCase();
    return categoryMatch && (!term || (p.name + ' ' + p.category + ' ' + p.description).toLowerCase().includes(term));
  }), [products, activeCategory, search]);

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const savings = cart.reduce((sum, item) => sum + ((item.oldPrice || item.price) - item.price) * item.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  appStateRef.current = { cart, products, language, pageContext, subtotal, count };

  useEffect(() => {
    const container = chatWindow.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages, agoraTranscript, busy, liveTranscript]);

  useEffect(() => {
    Promise.all([apiRequest('/api/products'), apiRequest('/api/cart'), apiRequest('/api/orders')])
      .then(([catalog, bag, history]) => {
        setProducts(catalog.products);
        setCart(bag.cart);
        setOrders(history.orders);
        setApiStatus('online');
      }).catch(error => {
      setApiStatus('offline');
      setNotice(error.message);
      });
    apiRequest('/api/voice/status').then(data => setAgoraReady(Boolean(data.agoraConfigured))).catch(() => setAgoraReady(false));
    apiRequest('/api/payments/razorpay/status').then(data => setRazorpayReady(Boolean(data.enabled))).catch(() => setRazorpayReady(false));

    const sections = [...document.querySelectorAll('main section[id]')];
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (current) setPageContext(context => ({ ...context, page: current.target.id }));
    }, { threshold: [0.2, 0.5] });
    sections.forEach(section => observer.observe(section));

    return () => {
      observer.disconnect();
      agoraMicRef.current?.close();
      agoraClientRef.current?.leave().catch(() => {});
      try { agoraVoiceAIRef.current?.unsubscribe(); } catch {}
      try { agoraVoiceAIRef.current?.destroy(); } catch {}
      agoraRtmRef.current?.logout().catch(() => {});
    };
  }, []);

  function say(text) {
    if (!text || !agoraCallActive || !agoraVoiceAIRef.current || !agoraAgentUidRef.current) return;
    agoraVoiceAIRef.current.speak(String(agoraAgentUidRef.current), { text })
      .catch(error => {
        console.error('Agora TTS request failed:', error);
        setNotice('Vibe could not speak that update through Agora.');
      });
  }

  function selectLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    setPageContext(context => ({ ...context, lastAction: 'Selected ' + (nextLanguage === 'kn-IN' ? 'Kannada' : 'English') }));
    setMessages(current => current.length === initialMessages.length
      ? (nextLanguage === 'kn-IN'
        ? [
            { role: 'assistant', text: 'ನಮಸ್ಕಾರ! ನಾನು Vibe, ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಶಾಪಿಂಗ್ ಸಹಾಯಕ. ಏನು ಹುಡುಕುತ್ತಿದ್ದೀರಿ ಎಂದು ಹೇಳಿ.' },
            { role: 'assistant', text: 'ಉದಾಹರಣೆ: “₹2,500 ಒಳಗೆ ಆರಾಮದಾಯಕ ಶೂಗಳನ್ನು ಹುಡುಕಿ.”', kind: 'hint' }
          ]
        : initialMessages)
      : current);
  }

  async function addToCart(product, quantity = 1) {
    try {
      const data = await apiRequest('/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, quantity }) });
      setCart(data.cart);
      setCoupon('');
      setDiscount(0);
      setPageContext(context => ({ ...context, lastAction: 'Added ' + product.name + ' to the bag' }));
      setNotice(product.name + ' added to your bag');
      setTimeout(() => setNotice(''), 2600);
      return true;
    } catch (error) {
      setNotice(error.message || 'Could not add this item. Please try again.');
      setTimeout(() => setNotice(''), 3000);
      return false;
    }
  }

  async function updateQuantity(productId, delta) {
    const item = cart.find(p => p.id === productId);
    if (!item) return;
    const next = Math.max(0, item.quantity + delta);
    try {
      const data = await apiRequest('/api/cart/items/' + productId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: next }) });
      setCart(data.cart);
      setCoupon('');
      setDiscount(0);
      setPageContext(context => ({ ...context, lastAction: `Changed ${item.name} quantity to ${next}` }));
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function applyCoupon(code) {
    const currentSubtotal = appStateRef.current.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const data = await apiRequest('/api/coupons/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, subtotal: currentSubtotal }) });
    setCoupon(code.toUpperCase());
    setDiscount(data.discount);
    setPageContext(context => ({ ...context, lastAction: 'Applied coupon ' + code.toUpperCase() }));
    return data;
  }

  async function checkout() {
    if (!cart.length) return;
    setBusy(true);
    try {
      if (razorpayReady) {
        await startRazorpayCheckout();
      } else {
        const data = await apiRequest('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coupon }) });
        completeOrder(data.order, false);
      }
    } catch (error) {
      setNotice(error.message);
      setBusy(false);
    }
  }

  function completeOrder(completedOrder, paymentConfirmed, { speak = true, addMessage = true } = {}) {
    setOrder(completedOrder);
    setOrders(current => [completedOrder, ...current]);
    setCart([]);
    setDiscount(0);
    setCoupon('');
    setCartOpen(false);
    apiRequest('/api/products').then(data => setProducts(data.products)).catch(error => setNotice(error.message));
    setPageContext(context => ({ ...context, lastAction: 'Placed order ' + completedOrder.id }));
    const text = language === 'kn-IN'
      ? paymentConfirmed
        ? `ನಿಮ್ಮ Razorpay ಪರೀಕ್ಷಾ ಪಾವತಿ ದೃಢವಾಗಿದೆ. ಆರ್ಡರ್ ${completedOrder.id}, ಒಟ್ಟು ${money(completedOrder.total)}.`
        : `ನಿಮ್ಮ ಡೆಮೊ ಆರ್ಡರ್ ${completedOrder.id} ದೃಢವಾಗಿದೆ. ಒಟ್ಟು ${money(completedOrder.total)}. ಯಾವುದೇ ಪಾವತಿ ಮಾಡಲಾಗಿಲ್ಲ.`
      : paymentConfirmed
        ? `Your Razorpay test payment is confirmed. Order ${completedOrder.id}, total ${money(completedOrder.total)}.`
        : `Your demo order ${completedOrder.id} is confirmed for ${money(completedOrder.total)}. No payment was collected.`;
    if (addMessage) setMessages(current => [...current, { role: 'assistant', text, kind: 'success' }]);
    if (agoraCallActive) {
      stopAfterAgentSpeechRef.current = true;
      heardOrderConfirmationRef.current = false;
      if (speak) say(text);
    }
  }

  async function startRazorpayCheckout({ assistantAction = false } = {}) {
    const paymentOrder = await apiRequest('/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coupon })
    });
    await loadRazorpayCheckout();
    if (!window.Razorpay) throw new Error('Razorpay Checkout did not initialize.');

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = completedOrder => {
        if (settled) return;
        settled = true;
        setBusy(false);
        resolve(completedOrder || null);
      };
      const razorpay = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: 'CartVibes',
        description: 'CartVibes sandbox purchase',
        order_id: paymentOrder.orderId,
        theme: { color: '#7b668e' },
        handler: async response => {
          try {
            const verified = await apiRequest('/api/payments/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response)
            });
            completeOrder(verified.order, true, assistantAction ? { speak: false, addMessage: false } : undefined);
            finish(verified.order);
          } catch (error) {
            setNotice(error.message);
            finish(null);
          }
        },
        modal: { ondismiss: () => finish(null) }
      });
      razorpay.on('payment.failed', response => {
        setNotice(response.error?.description || 'The Razorpay test payment did not complete. You can try again.');
        finish(null);
      });
      try {
        razorpay.open();
      } catch (error) {
        reject(error);
      }
    });
  }

  async function runShoppingAction(action) {
    if (!action) return '';
    const currentLanguage = appStateRef.current.language;
    if (action.type === 'add_to_cart') {
      const product = appStateRef.current.products.find(item => item.id === action.productId);
      if (!product) return currentLanguage === 'kn-IN' ? 'ಈ ಉತ್ಪನ್ನ ಕ್ಯಾಟಲಾಗ್‌ನಲ್ಲಿ ಇಲ್ಲ.' : 'I could not find that product in the catalogue.';
      const added = await addToCart(product, action.quantity || 1);
      if (added) setCartOpen(true);
      return currentLanguage === 'kn-IN'
        ? (added ? `${product.name} ಅನ್ನು ನಿಮ್ಮ ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿದ್ದೇನೆ.` : `${product.name} ಅನ್ನು ಸೇರಿಸಲಾಗಲಿಲ್ಲ. ಸ್ಟಾಕ್ ಪರಿಶೀಲಿಸಿ.`)
        : (added ? `I added ${product.name} to your bag.` : `I could not add ${product.name}; please check its stock.`);
    }
    if (action.type === 'apply_coupon') {
      try {
        const result = await applyCoupon(action.code);
        return currentLanguage === 'kn-IN' ? `VIBE10 ಅನ್ವಯಿಸಲಾಗಿದೆ. ನೀವು ${money(result.discount)} ಉಳಿಸಿದ್ದೀರಿ.` : `VIBE10 is applied. You saved ${money(result.discount)}.`;
      } catch (error) {
        return currentLanguage === 'kn-IN' ? 'ಆ ಕೂಪನ್ ಅನ್ವಯಿಸಲಾಗಲಿಲ್ಲ.' : error.message;
      }
    }
    if (action.type === 'show_cart') {
      setCartOpen(true);
      setPageContext(context => ({ ...context, lastAction: 'Opened shopping bag' }));
      return currentLanguage === 'kn-IN' ? 'ನಿಮ್ಮ ಕಾರ್ಟ್ ಅನ್ನು ತೆರೆಯಲಾಗಿದೆ.' : 'I opened your bag so you can review it.';
    }
    if (action.type === 'show_orders') {
      await loadOrders();
      return currentLanguage === 'kn-IN' ? 'ನಿಮ್ಮ ಆರ್ಡರ್ ಇತಿಹಾಸವನ್ನು ತೆರೆಯಲಾಗಿದೆ.' : 'I opened your order history.';
    }
    if (action.type === 'checkout' || action.type === 'place_order') {
      if (action.type === 'place_order') {
        const product = appStateRef.current.products.find(item => item.id === action.productId);
        if (!product) return currentLanguage === 'kn-IN' ? 'ಈ ಉತ್ಪನ್ನ ಕ್ಯಾಟಲಾಗ್‌ನಲ್ಲಿ ಇಲ್ಲ.' : 'I could not find that product in the catalogue.';
        const alreadyInCart = appStateRef.current.cart.some(item => item.id === product.id);
        if (!alreadyInCart && !(await addToCart(product, action.quantity || 1))) {
          return currentLanguage === 'kn-IN' ? 'ಉತ್ಪನ್ನವನ್ನು ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಲಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಆರ್ಡರ್ ಮಾಡಲಾಗಲಿಲ್ಲ.' : 'I could not add that item, so I did not place the order.';
        }
      } else if (!appStateRef.current.cart.length) {
        return currentLanguage === 'kn-IN' ? 'ನಿಮ್ಮ ಕಾರ್ಟ್ ಖಾಲಿಯಿದೆ. ಮೊದಲು ಉತ್ಪನ್ನವನ್ನು ಸೇರಿಸಿ.' : 'Your bag is empty. Add a product before placing an order.';
      }
      setCartOpen(true);
      return placeAssistantOrder();
    }
    return '';
  }

  function getAgentContext(data, actionResult) {
    const productContext = (data.products || [])
      .map(product => `${product.name}, ${money(product.price)}, ${product.stock} in stock`)
      .join('; ');
    return [
      actionResult && `Verified storefront result: ${actionResult}`,
      productContext && `Matching products from the live local catalogue: ${productContext}`,
      !actionResult && !productContext && 'No storefront action was completed.'
    ].filter(Boolean).join('. ');
  }

  function rememberSuggestedProducts(data) {
    if (!data.action && data.products?.length) {
      suggestedProductIdsRef.current = data.products.slice(0, 3).map(product => product.id);
    }
  }

  async function placeAssistantOrder() {
    setBusy(true);
    try {
      const completedOrder = razorpayReady
        ? await startRazorpayCheckout({ assistantAction: true })
        : (await apiRequest('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coupon })
          })).order;
      if (!completedOrder) {
        return appStateRef.current.language === 'kn-IN'
          ? 'ಪಾವತಿ ಪೂರ್ಣವಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಆರ್ಡರ್ ಮಾಡಲಾಗಿಲ್ಲ.'
          : 'Payment was not completed, so I did not place the order.';
      }
      if (!razorpayReady) completeOrder(completedOrder, false, { speak: false, addMessage: false });
      return appStateRef.current.language === 'kn-IN'
        ? razorpayReady
          ? `Razorpay ಪರೀಕ್ಷಾ ಪಾವತಿ ದೃಢವಾಗಿದೆ. ಆರ್ಡರ್ ${completedOrder.id}, ಒಟ್ಟು ${money(completedOrder.total)}.`
          : `ಆರ್ಡರ್ ${completedOrder.id} ಉಳಿಸಲಾಗಿದೆ. ಒಟ್ಟು ${money(completedOrder.total)}. ಪಾವತಿ ಮಾಡಲಾಗಿಲ್ಲ.`
        : razorpayReady
          ? `Your Razorpay test payment is confirmed. Order ${completedOrder.id}, total ${money(completedOrder.total)}.`
          : `Your order ${completedOrder.id} is saved for ${money(completedOrder.total)}. No payment was collected.`;
    } catch (error) {
      return error.message || 'I could not place the order.';
    } finally {
      setBusy(false);
    }
  }

  async function processTranscriptAction(text, data, showProducts = true) {
    if (data.products?.length && !data.action) {
      if (showProducts) setMessages(current => [...current, {
        role: 'assistant',
        text: appStateRef.current.language === 'kn-IN' ? 'ನಿಮ್ಮ ಮಾತಿಗೆ ಹೊಂದುವ ಕೆಲವು ಆಯ್ಕೆಗಳು ಇಲ್ಲಿವೆ.' : 'Here are a few options that match what you said.',
        products: data.products
      }]);
    }
    if (!data.action) return '';
    return runShoppingAction(data.action);
  }

  function updateTranscriptStatus(turnKey, status, isError = false) {
    const entry = { status, statusIsError: isError };
    transcriptStatusesRef.current.set(turnKey, entry);
    setAgoraTranscript(current => current.map(item =>
      item.key === turnKey ? { ...item, ...entry } : item
    ));
  }

  async function handleAgoraTranscript(transcript) {
    const list = Array.isArray(transcript) ? transcript : [];
    const userTranscripts = getUserTranscriptItems(list);
    const transcriptItems = list.map(item => {
      const key = `${item.uid}:${item.turn_id}:${item.stream_id}`;
      return {
        key,
        role: item.metadata?.object === 'user.transcription' ? 'user' : 'assistant',
        text: item.text,
        final: !isTranscriptInProgress(item),
        products: transcriptProductsRef.current.get(key) || [],
        ...transcriptStatusesRef.current.get(key)
      };
    });
    setAgoraTranscript(transcriptItems);
    const interim = [...userTranscripts].reverse().find(isTranscriptInProgress);
    setLiveTranscript(interim?.text || '');
    if (interim) setVoicePipelineStatus('Agora sent an interim transcript; waiting for the completed turn.');

    // The toolkit normalizes user transcription UIDs to "0", not the RTC UID.
    for (const item of userTranscripts) {
      if (!isFinalTranscript(item) || !item.text?.trim()) continue;
      const turnKey = `${item.uid}:${item.turn_id}:${item.stream_id}`;
      if (processedTranscriptTurnsRef.current.has(turnKey) || pendingTranscriptTurnsRef.current.has(turnKey)) continue;
      window.clearTimeout(transcriptDiagnosticTimerRef.current);
      transcriptDiagnosticTimerRef.current = null;
      pendingTranscriptTurnsRef.current.add(turnKey);
      updateTranscriptStatus(turnKey, 'Final transcript received; sending it to the shopping assistant…');
      setVoicePipelineStatus('Final transcript received from Agora; sending it to the backend.');
      try {
        const sessionKey = agoraSessionRef.current?.sessionKey;
        if (!sessionKey) throw new Error('The live voice session is not ready to process this transcript.');
        const data = await apiRequest('/api/voice/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionKey,
            turnId: turnKey,
            message: item.text,
            pageContext: appStateRef.current.pageContext,
            conversationContext: { suggestedProductIds: suggestedProductIdsRef.current }
          })
        });
        processedTranscriptTurnsRef.current.add(turnKey);
        pendingTranscriptTurnsRef.current.delete(turnKey);
        rememberSuggestedProducts(data);
        const actionProduct = data.action?.productId
          ? appStateRef.current.products.find(product => product.id === data.action.productId)
          : null;
        const transcriptProducts = actionProduct ? [actionProduct] : data.action ? [] : data.products || [];
        if (transcriptProducts.length) {
          transcriptProductsRef.current.set(turnKey, transcriptProducts);
          setAgoraTranscript(current => current.map(entry =>
            entry.key === turnKey ? { ...entry, products: transcriptProducts } : entry
          ));
        }
        let actionResult;
        if (data.actionHandled) {
          setCart(data.cart || []);
          if (data.actionSucceeded) {
            setCartOpen(true);
            setCoupon('');
            setDiscount(0);
            const product = appStateRef.current.products.find(item => item.id === data.action.productId);
            if (product) setPageContext(context => ({ ...context, lastAction: 'Added ' + product.name + ' to the bag' }));
          }
          actionResult = data.actionResult || data.reply;
        } else {
          actionResult = await processTranscriptAction(item.text, data, false);
        }
        if (data.action && actionResult) {
          setMessages(current => [...current, { role: 'assistant', text: actionResult }]);
          say(actionResult);
        } else if (data.intent) {
          setMessages(current => [...current, { role: 'assistant', text: data.reply }]);
          say(data.reply);
        }
        const processingStatus = data.actionHandled
          ? data.actionSucceeded
            ? 'Backend recorded · typed-chat assistant logic ran · cart action succeeded.'
            : 'Backend recorded · typed-chat assistant logic ran · cart action failed: ' + data.actionResult
          : data.action
            ? 'Backend recorded · typed-chat assistant logic ran · action: ' + (actionResult || 'completed')
            : 'Backend recorded · typed-chat assistant logic ran · no cart action was requested.';
        updateTranscriptStatus(turnKey, processingStatus);
        setVoicePipelineStatus(processingStatus);
      } catch (error) {
        pendingTranscriptTurnsRef.current.delete(turnKey);
        updateTranscriptStatus(turnKey, 'Transcript received, but backend processing failed: ' + error.message, true);
        setVoicePipelineStatus('Transcript received from Agora, but the backend request failed.');
        setMessages(current => [...current, { role: 'assistant', text: error.message, kind: 'error' }]);
        say(error.message);
      }
    }
  }

  async function processMessage(raw) {
    const text = raw.trim();
    if (!text) return;
    setInput('');
    setBusy(true);
    try {
      if (agoraReady && !agoraVoiceAIRef.current) await startAgora();
      const data = await apiRequest('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          cart: appStateRef.current.cart,
          language: appStateRef.current.language,
          pageContext: appStateRef.current.pageContext,
          conversationContext: { suggestedProductIds: suggestedProductIdsRef.current }
        })
      });
      rememberSuggestedProducts(data);

      if (agoraVoiceAIRef.current && agoraAgentUidRef.current) {
        const actionResult = data.action ? await runShoppingAction(data.action) : '';
        const actionProduct = data.action?.productId
          ? appStateRef.current.products.find(product => product.id === data.action.productId)
          : null;
        const displayedProducts = actionProduct ? [actionProduct] : data.action ? [] : data.products || [];
        setMessages(current => [
          ...current,
          { role: 'user', text },
          ...(displayedProducts.length ? [{
            role: 'assistant',
            text: language === 'kn-IN' ? 'ನಿಮ್ಮ ಹುಡುಕಾಟಕ್ಕೆ ಹೊಂದುವ ಆಯ್ಕೆಗಳು ಇಲ್ಲಿವೆ.' : 'Here are a few options that match your request.',
            products: displayedProducts
          }] : [])
        ]);
        const context = getAgentContext(data, actionResult);
        await agoraVoiceAIRef.current.think(String(agoraAgentUidRef.current), {
          text: `Customer message: ${text}. ${context} Respond naturally in ${language === 'kn-IN' ? 'Kannada' : 'English'}, using the verified catalogue and storefront result.`,
          onListeningAction: 'interrupt',
          onThinkingAction: 'interrupt',
          onSpeakingAction: 'interrupt'
        });
      } else {
        setMessages(current => [...current, { role: 'user', text }]);
        const actionResult = await processTranscriptAction(text, data, false);
        const reply = [data.reply, actionResult].filter(Boolean).join(' ');
        setMessages(current => [...current, { role: 'assistant', text: reply, products: data.products || [] }]);
      }
    } catch (error) {
      setMessages(current => [...current, { role: 'assistant', text: error.message, kind: 'error' }]);
    } finally {
      setBusy(false);
    }
  }

  async function loadOrders() {
    setOrdersOpen(true);
    setPageContext(context => ({ ...context, lastAction: 'Opened order history' }));
    try {
      const data = await apiRequest('/api/orders');
      setOrders(data.orders);
    } catch (error) {
      setNotice(error.message);
    }
  }

  function startListening() {
    setAssistantOpen(true);
    if (agoraCallActive) {
      stopAgora();
      return;
    }
    if (agoraConnecting) return;
    if (!window.isSecureContext) {
      setNotice('Chrome blocks microphone access on this network address. Open CartVibes at http://localhost:5173, or use HTTPS.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('This browser cannot access a microphone. Open CartVibes in Chrome on localhost or HTTPS.');
      return;
    }
    if (!agoraReady) {
      apiRequest('/api/voice/status').then(data => {
        const ready = Boolean(data.agoraConfigured);
        setAgoraReady(ready);
        if (ready) startAgora();
        else setNotice('Live voice is not configured in the server .env file: ' + (data.missing || []).join(', '));
      }).catch(error => setNotice(error.message));
      return;
    }
    startAgora();
  }

  async function startAgora() {
    if (agoraConnecting || agoraVoiceAIRef.current) return true;
    processedTranscriptTurnsRef.current.clear();
    pendingTranscriptTurnsRef.current.clear();
    transcriptStatusesRef.current.clear();
    transcriptProductsRef.current.clear();
    suggestedProductIdsRef.current = [];
    setAgoraTranscript([]);
    setLiveTranscript('');
    setVoicePipelineStatus('Waiting for a transcript from Agora…');
    setAgoraConnecting(true);
    setAgoraCallStatus('Starting secure voice session…');
    let session = null;
    let client = null;
    let microphone = null;
    let rtmClient = null;
    let voiceAI = null;
    let remoteStarted = false;

    try {
      if (!window.isSecureContext) {
        throw new Error('Chrome blocks microphone access on this network address. Open CartVibes at http://localhost:5173, or use HTTPS.');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser cannot access a microphone. Open CartVibes in Chrome on localhost or HTTPS.');
      }
      const data = await apiRequest('/api/voice/agora/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, pageContext })
      });
      session = data;
      agoraSessionRef.current = session;
      const [rtcModule, rtmModule, toolkit] = await Promise.all([
        import('agora-rtc-sdk-ng'),
        import('agora-rtm'),
        import('agora-agent-client-toolkit')
      ]);
      const AgoraRTC = rtcModule.default || rtcModule;
      const AgoraRTM = rtmModule.default || rtmModule;
      const RTMClient = typeof AgoraRTM === 'function' ? AgoraRTM : AgoraRTM.RTM || AgoraRTM.RTMClient;
      if (!RTMClient) throw new Error('The Agora Signaling SDK could not initialize.');
      const { AgoraVoiceAI, AgoraVoiceAIEvents } = toolkit;

      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio' && user.audioTrack) {
            user.audioTrack.play();
          }
        } catch (error) {
          console.error('Could not subscribe to Vibe audio:', error);
          setNotice('Connected, but I could not play the assistant audio. Check your browser audio permissions.');
        }
      });
      client.on('user-unpublished', (_user, mediaType) => {
        if (mediaType === 'audio') {
          setSpeaking(false);
          setAgoraCallStatus('Connected · waiting for Vibe');
        }
      });
      client.on('user-left', () => {
        setAgoraCallStatus('The voice agent disconnected');
      });

      rtmClient = new RTMClient(data.appId, String(data.uid));
      try {
        await rtmClient.login({ token: data.rtmToken });
      } catch (error) {
        console.error('Agora Signaling is unavailable; continuing with RTC voice:', error);
        rtmClient = null;
        setNotice('Agora voice is connecting, but live controls/transcripts may be limited because Signaling could not connect.');
      }
      await client.join(data.appId, data.channel, data.token, Number(data.uid));
      microphone = await AgoraRTC.createMicrophoneAudioTrack();
      await client.publish([microphone]);

      voiceAI = await AgoraVoiceAI.init({
        rtcEngine: client,
        ...(rtmClient ? { rtmEngine: rtmClient } : {}),
        renderMode: toolkit.TranscriptHelperMode.TEXT,
        enableLog: import.meta.env.DEV
      });
      voiceAI.on(AgoraVoiceAIEvents.DEBUG_LOG, message => {
        if (String(message).includes('<<< stream-message')) {
          setVoicePipelineStatus('Agora RTC data arrived; waiting for the transcript to be parsed.');
        }
      });
      voiceAI.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, transcript => {
        void handleAgoraTranscript(transcript);
      });
      voiceAI.on(AgoraVoiceAIEvents.MESSAGE_ERROR, error => {
        console.error('Agora transcript message error:', error);
        setVoicePipelineStatus('Agora reported a transcript/message error: ' + (error?.message || 'check the browser console.'));
      });
      voiceAI.on(AgoraVoiceAIEvents.AGENT_SPEAKING_CHANGED, (_agentUid, active) => {
        setSpeaking(Boolean(active));
        if (active && stopAfterAgentSpeechRef.current) heardOrderConfirmationRef.current = true;
        if (!active && heardOrderConfirmationRef.current) {
          heardOrderConfirmationRef.current = false;
          stopAfterAgentSpeechRef.current = false;
          void stopAgora(true);
        }
      });
      voiceAI.on(AgoraVoiceAIEvents.AGENT_ERROR, (_agentUid, error) => {
        console.error('Agora agent error:', error);
        setNotice(error?.message || 'The Agora voice agent reported an error.');
      });
      voiceAI.subscribeMessage(data.channel);

      agoraClientRef.current = client;
      agoraMicRef.current = microphone;
      agoraRtmRef.current = rtmClient;
      agoraVoiceAIRef.current = voiceAI;
      agoraUserUidRef.current = data.uid;
      agoraAgentUidRef.current = data.agentUid;

      const started = await apiRequest(`/api/voice/agora/session/${data.sessionKey}/start`, { method: 'POST' });
      remoteStarted = true;
      agoraClientRef.current = client;
      agoraMicRef.current = microphone;
      agoraSessionRef.current = { ...session, ...started };
      setAgoraCallActive(true);
      setAgoraCallStatus('Live · speak naturally');
      transcriptDiagnosticTimerRef.current = window.setTimeout(() => {
        if (!processedTranscriptTurnsRef.current.size && !pendingTranscriptTurnsRef.current.size) {
          setVoicePipelineStatus('No completed transcript reached the app from Agora after 15 seconds. Check the Agora diagnostics in the browser console.');
        }
      }, 16000);
      setMessages(current => [
        ...current,
        { role: 'assistant', text: language === 'kn-IN'
          ? 'Agora ಲೈವ್ ಧ್ವನಿ ಸಂಪರ್ಕವಾಗಿದೆ. ಸಹಜವಾಗಿ ಮಾತನಾಡಿ—ಮಧ್ಯೆ ತಡೆಯಬಹುದು. ಆರ್ಡರ್ ಪೂರ್ಣವಾಗುವವರೆಗೆ ಮೈಕ್ ಸಕ್ರಿಯವಾಗಿರುತ್ತದೆ.'
          : 'Agora live voice is connected. Speak naturally and interrupt Vibe whenever you like. The mic stays on until you finish the order or tap the button to end.', kind: 'hint' }
      ]);
      return true;
    } catch (error) {
      window.clearTimeout(transcriptDiagnosticTimerRef.current);
      transcriptDiagnosticTimerRef.current = null;
      setAgoraCallActive(false);
      microphone?.close();
      if (client) {
        try { await client.leave(); } catch {}
      }
      if (voiceAI) {
        try { voiceAI.unsubscribe(); } catch {}
        try { voiceAI.destroy(); } catch {}
      }
      if (rtmClient) {
        try { await rtmClient.logout(); } catch {}
      }
      if (session?.sessionKey) {
        if (remoteStarted && agoraSessionRef.current?.agentSessionId) {
          fetch('/api/voice/agora/session/' + agoraSessionRef.current.agentSessionId + '/stop', { method: 'POST' }).catch(() => {});
        } else {
          fetch('/api/voice/agora/session/' + session.sessionKey + '/cancel', { method: 'POST' }).catch(() => {});
        }
      }
      agoraClientRef.current = null;
      agoraMicRef.current = null;
      agoraRtmRef.current = null;
      agoraVoiceAIRef.current = null;
      agoraSessionRef.current = null;
      setAgoraCallStatus('Not connected');
      setNotice(error.name === 'NotAllowedError'
        ? 'Chrome blocked microphone access. Allow the mic for http://localhost:5173 in Site settings, then reload.'
        : error.message || 'Could not connect to Agora voice.');
      setTimeout(() => setNotice(''), 6000);
      return false;
    } finally {
      setAgoraConnecting(false);
    }
  }

  async function stopAgora(silent = false) {
    if (agoraConnecting) return;
    setAgoraConnecting(true);
    window.clearTimeout(transcriptDiagnosticTimerRef.current);
    transcriptDiagnosticTimerRef.current = null;
    const session = agoraSessionRef.current;
    const microphone = agoraMicRef.current;
    const client = agoraClientRef.current;
    const voiceAI = agoraVoiceAIRef.current;
    const rtmClient = agoraRtmRef.current;

    try {
      microphone?.stop();
      microphone?.close();
      if (client) {
        try { await client.unpublish(); } catch {}
        try { await client.leave(); } catch {}
      }
      if (voiceAI) {
        try { voiceAI.unsubscribe(); } catch {}
        voiceAI.destroy();
      }
      if (rtmClient) await rtmClient.logout();
      if (session?.agentSessionId) {
        await apiRequest('/api/voice/agora/session/' + session.agentSessionId + '/stop', { method: 'POST' });
      }
      if (!silent) {
        setNotice('Live voice conversation ended.');
        setTimeout(() => setNotice(''), 2500);
      }
    } catch (error) {
      if (!silent) {
        setNotice(error.message || 'The call ended locally, but the remote agent may take a moment to stop.');
        setTimeout(() => setNotice(''), 4500);
      }
    } finally {
      agoraMicRef.current = null;
      agoraClientRef.current = null;
      agoraRtmRef.current = null;
      agoraVoiceAIRef.current = null;
      agoraUserUidRef.current = null;
      agoraAgentUidRef.current = null;
      agoraSessionRef.current = null;
      setAgoraCallActive(false);
      setAgoraCallStatus('Not connected');
      setVoicePipelineStatus('Voice session could not start: ' + error.message);
      setAgoraConnecting(false);
      setSpeaking(false);
      setLiveTranscript('');
      setVoicePipelineStatus(processedTranscriptTurnsRef.current.size
        ? 'Call ended. The transcript and backend result remain visible above.'
        : 'Call ended before a final transcript was recorded by the backend.');
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><ShoppingBag size={19}/></span><span>cart<span className="brand-accent">vibes</span><i>.</i></span></a>
        <nav className="nav-links"><a className="active" href="#discover">Discover</a><a href="#how">How it works</a><a href="#about">Our vibe</a><button onClick={loadOrders}>Orders</button></nav>
        <div className="top-actions">
          <button className="icon-button" aria-label="Search" onClick={() => document.getElementById('product-search')?.focus()}><Search size={19}/></button>
          <label className="language-picker header-language"><span>Language</span><select value={language} onChange={event => selectLanguage(event.target.value)} disabled={agoraCallActive}><option value="en-IN">English</option><option value="kn-IN">ಕನ್ನಡ</option></select></label>
          <button className="icon-button orders-shortcut" aria-label="View orders" onClick={loadOrders}><ClipboardList size={19}/></button>
          <button className="bag-button" onClick={() => { setCartOpen(true); setPageContext(context => ({ ...context, lastAction: 'Opened shopping bag' })); }}><ShoppingBag size={18}/><span>My bag</span><b>{count}</b></button>
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot"/> THE FUTURE OF FEEL-GOOD SHOPPING</div>
            <h1>Good finds.<br/><em>Great vibes.</em></h1>
            <p className="hero-description">Skip the endless scrolling. Tell us what you're looking for, and let's find your next favourite thing.</p>
            <div className="hero-cta">
              <button className="primary-button" onClick={() => setAssistantOpen(true)}>Shop with Vibe <Sparkles size={17}/></button>
              <span><span className="avatar-stack"><i>☺</i><i>✦</i><i>♡</i></span> Shopping, made personal</span>
            </div>
            <div className="hero-perks"><span><Check size={14}/> Curated picks</span><span><Check size={14}/> No-pressure advice</span><span><Check size={14}/> Easy checkout</span></div>
          </div>
          <div className="hero-art">
            <div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/>
            <div className="hero-sun">✳</div>
            <div className="hero-product hero-product-main"><span>👜</span><small>THE EVERYDAY EDIT</small></div>
            <div className="hero-product hero-product-small"><span>🎧</span></div>
            <div className="hero-product hero-product-shoe"><span>👟</span></div>
            <div className="floating-note"><span className="note-spark">✦</span><div><b>A little more you.</b><small>Every recommendation, considered.</small></div></div>
            <div className="hero-sticker">SHOP<br/>YOUR<br/>VIBE <span>↘</span></div>
          </div>
          <div className="hero-bottom"><span>01 / A NEW WAY TO SHOP</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="assistant-section" id="assistant">
          <div className="section-intro"><div className="eyebrow"><span className="eyebrow-dot"/> YOUR PERSONAL SHOPPING SIDEKICK</div><h2>Say hello to <em>Vibe.</em></h2><p>One conversation can get you from “just browsing” to “that's the one.”</p></div>
          <div className="assistant-invite">
            <div className="vibe-avatar"><AudioLines size={23}/><span/></div>
            <div><b>Vibe is always one tap away.</b><p>Tell Vibe your budget or what you’re in the mood for. It can find products, update your bag, apply VIBE10, and help you place a sandbox order.</p></div>
            <button className="primary-button" onClick={() => setAssistantOpen(true)}>Open Vibe <ArrowRight size={16}/></button>
          </div>
        </section>

        <section className="discover-section" id="discover">
          <div className="discover-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> THE GOOD STUFF</div><h2>Find your <em>favourite.</em></h2><p>A few lovely things to get you started.</p></div><div className="catalog-search"><Search size={17}/><input id="product-search" value={search} onChange={e => { setSearch(e.target.value); setPageContext(context => ({ ...context, lastAction: e.target.value ? 'Searched products for ' + e.target.value : 'Cleared product search' })); }} placeholder="Search the edit…"/></div></div>
          <div className="category-row">{categories.map(category => <button key={category} className={activeCategory === category ? 'selected' : ''} onClick={() => { setActiveCategory(category); setPageContext(context => ({ ...context, lastAction: 'Selected the ' + category + ' category' })); }}>{category}</button>)}</div>
          <div className="product-grid">{visibleProducts.map((product, index) => <article className="product-card" key={product.id}>
            <div className={'product-art ' + product.color}><span className="product-tag">{product.tag}</span><button className="heart-button" aria-label="Save item"><Heart size={17}/></button><div className="product-emoji">{product.emoji}</div><span className="art-index">0{index + 1}</span></div>
            <div className="product-info"><div className="product-category">{product.category}</div><h3>{product.name}</h3><div className="rating"><Star size={13} fill="currentColor"/> {product.rating} <span>({product.reviews} reviews)</span></div><div className="product-buy"><div><b>{money(product.price)}</b><del>{money(product.oldPrice)}</del></div><button onClick={() => addToCart(product)} disabled={product.stock === 0 || apiStatus !== 'online'}>{product.stock === 0 ? 'Sold out' : <><Plus size={16}/> Add</>}</button></div></div>
          </article>)}</div>
          {visibleProducts.length === 0 && <div className="empty-search">No finds just yet. Try another search or category.</div>}
        </section>

        <section className="how-section" id="how"><div className="how-top"><div className="eyebrow"><span className="eyebrow-dot"/> THE CARTVIBES WAY</div><h2>Less searching.<br/><em>More finding.</em></h2><p>Shopping should feel like talking to someone who just gets you.</p></div><div className="how-steps"><div><span>01</span><b>Tell us your vibe</b><p>Share what you need, what you love, and what you'd like to spend.</p></div><div><span>02</span><b>Get the good picks</b><p>Compare thoughtful recommendations, without the endless scroll.</p></div><div><span>03</span><b>Make it yours</b><p>Add to your bag, use a deal, and place a sandbox order.</p></div></div></section>
      </main>

      <footer id="about"><a className="brand" href="#"><span className="brand-mark"><ShoppingBag size={17}/></span><span>cart<span className="brand-accent">vibes</span><i>.</i></span></a><span>GOOD FINDS. GREAT VIBES. © 2026 CARTVIBES</span><span>MADE FOR THE WAY YOU SHOP NOW ✳</span></footer>

      {assistantOpen && <section className="agent-widget" aria-label="Vibe shopping assistant">
        <div className="agent-widget-head">
          <div className="vibe-avatar"><AudioLines size={21}/><span/></div>
          <div className="agent-title"><b>Vibe</b><small>{agoraCallActive ? 'Live voice · Agora + Murf Falcon' : 'Your shopping sidekick'}</small></div>
          <label className="language-picker"><span>Language</span><select value={language} onChange={event => selectLanguage(event.target.value)} disabled={agoraCallActive}><option value="en-IN">English</option><option value="kn-IN">ಕನ್ನಡ</option></select></label>
          <button className="close-button" aria-label="Close Vibe" onClick={() => setAssistantOpen(false)}><X size={19}/></button>
        </div>
        <div className="agent-context"><span>Browsing: {pageContext.page}</span>{pageContext.lastAction && <small>Last action: {pageContext.lastAction}</small>}</div>
        <div className="chat-window" ref={chatWindow} role="log" aria-live="polite">
          {messages.map((message, index) => <div className={'message-row ' + message.role} key={index}>
            {message.role === 'assistant' && <div className="mini-avatar"><AudioLines size={14}/></div>}
            <div className={'message-bubble ' + (message.kind || '')}>{message.text}
              {message.products?.length > 0 && <div className="chat-product-list">{message.products.map(product => <button key={product.id} onClick={() => addToCart(product)} disabled={apiStatus !== 'online'}><span>{product.emoji}</span><span><b>{product.name}</b><small>{money(product.price)} · {product.stock} in stock</small></span><Plus size={15}/></button>)}</div>}
            </div>
          </div>)}
          {agoraTranscript.map(item => <div className={'message-row ' + item.role} key={item.key}>
            {item.role === 'assistant' && <div className="mini-avatar"><AudioLines size={14}/></div>}
            <div className={'message-bubble ' + (!item.final ? 'transcript' : '')}>{item.text}{!item.final ? '…' : ''}
              {item.products?.length > 0 && <div className="chat-product-list">{item.products.map(product => <button key={product.id} onClick={async () => { if (await addToCart(product)) setCartOpen(true); }} disabled={apiStatus !== 'online'}><span>{product.emoji}</span><span><b>{product.name}</b><small>{money(product.price)} · {product.stock} in stock</small></span><Plus size={15}/></button>)}</div>}
              {item.status && <small className={'transcript-status ' + (item.statusIsError ? 'error' : '')}>{item.status}</small>}
            </div>
          </div>)}
          {busy && <div className="message-row assistant"><div className="mini-avatar"><AudioLines size={14}/></div><div className="message-bubble typing"><i/><i/><i/></div></div>}
        </div>
        <div className="chat-compose">
          <button className={'mic-button ' + (agoraCallActive ? 'listening' : '')} onClick={startListening} disabled={agoraConnecting} title={agoraCallActive ? 'End the live conversation' : 'Start live Agora voice'}>{agoraCallActive ? <MicOff size={27}/> : <Mic size={27}/>}<span>{agoraCallActive ? 'End call' : 'Talk to Vibe'}</span></button>
          <div className="text-compose">
            <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && processMessage(input)} placeholder={agoraCallActive ? 'Voice is live; you can also type' : 'Or type a request'} />
            <button className="send-button" onClick={() => processMessage(input)} disabled={!input.trim() || busy}><Send size={17}/></button>
          </div>
        </div>
        <div className="voice-foot"><span><span className="sound-bars"><i/><i/><i/><i/></span> {agoraConnecting ? 'Connecting to Agora…' : agoraCallActive ? liveTranscript ? 'Listening to you…' : speaking ? 'Vibe is speaking…' : 'Live · speak naturally' : speaking ? 'Vibe is speaking…' : apiStatus === 'offline' ? 'Shopping service offline' : 'Tap Talk to Vibe for live voice'}</span><span>{language === 'kn-IN' ? 'ಕನ್ನಡ' : 'ENGLISH'}</span></div>
        <div className="voice-pipeline-status" role="status">{voicePipelineStatus}</div>
        <div className="voice-provider-note">{agoraReady ? 'Agora handles live speech recognition and conversation; RTM delivers transcripts and Murf Falcon 2.1 speaks back. If Chrome blocks the mic, open http://localhost:5173 instead of the network IP.' : 'Live voice uses Agora + Murf credentials from the server .env file. Browser speech recognition is not used.'}</div>
      </section>}
      <button className={'agent-launch ' + (assistantOpen ? 'open' : '')} onClick={() => setAssistantOpen(open => !open)} aria-label={assistantOpen ? 'Close Vibe assistant' : 'Open Vibe assistant'} aria-expanded={assistantOpen}>
        {assistantOpen ? <X size={21}/> : <><AudioLines size={20}/><span>Ask Vibe</span></>}
      </button>

      {notice && <div className="toast"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}

      {cartOpen && <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="eyebrow">YOUR LITTLE COLLECTION</span><h2>My bag <span>({count})</span></h2></div><button className="close-button" onClick={() => setCartOpen(false)}><X/></button></div>
        {cart.length ? <><div className="cart-items">{cart.map(item => <div className="cart-item" key={item.id}><div className={'cart-thumb ' + item.color}>{item.emoji}</div><div className="cart-item-details"><b>{item.name}</b><small>{money(item.price)} each</small><div className="quantity-control"><button onClick={() => updateQuantity(item.id, -1)}><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)}><Plus size={13}/></button></div></div><div className="cart-item-end"><b>{money(item.price * item.quantity)}</b><button onClick={() => updateQuantity(item.id, -item.quantity)}><Trash2 size={15}/></button></div></div>)}</div>
        <div className="coupon-box"><label htmlFor="coupon">GOT A LITTLE CODE?</label><div><input id="coupon" value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Try VIBE10"/><button onClick={async () => { try { const d = await applyCoupon(coupon); setNotice('You saved ' + money(d.discount) + '!'); } catch (e) { setNotice(e.message); } }}>Apply</button></div><small>Demo code: VIBE10 · 10% off your bag</small></div>
        <div className="cart-summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{savings > 0 && <div><span>Product savings</span><b className="saving">−{money(savings)}</b></div>}{discount > 0 && <div><span>VIBE10 discount</span><b className="saving">−{money(discount)}</b></div>}<div className="total-row"><span>Total</span><b>{money(total)}</b></div><button className="checkout-button" onClick={checkout} disabled={busy}>{busy ? 'Opening checkout…' : razorpayReady ? 'Pay with Razorpay · Test mode' : 'Place demo order'} <ArrowRight size={17}/></button><p><Truck size={14}/>{razorpayReady ? 'Razorpay sandbox · Test payment only' : 'Demo checkout · No real payment collected'}</p></div></> : <div className="empty-cart"><span>🛍️</span><h3>Your bag is taking a little breather.</h3><p>Let's find something you'll love.</p><button className="primary-button" onClick={() => { setCartOpen(false); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }); }}>Explore the edit <ArrowRight size={16}/></button></div>}
      </aside></div>}

      {ordersOpen && <div className="drawer-backdrop" onClick={() => setOrdersOpen(false)}><aside className="orders-drawer" onClick={event => event.stopPropagation()}>
        <div className="drawer-head"><div><span className="eyebrow">YOUR CARTVIBES HISTORY</span><h2>My orders <span>({orders.length})</span></h2></div><button className="close-button" aria-label="Close orders" onClick={() => setOrdersOpen(false)}><X/></button></div>
        {orders.length ? <div className="orders-list">{orders.map(orderItem => <article className="order-card" key={orderItem.id}>
          <div className="order-card-head"><b>{orderItem.id}</b><span>{orderItem.status}</span></div>
          <small>{new Date(orderItem.createdAt).toLocaleString()}</small>
          <p>{orderItem.items.map(item => `${item.name} × ${item.quantity}`).join(', ')}</p>
          <div className="order-card-total"><span>Order total</span><b>{money(orderItem.total)}</b></div>
        </article>)}</div> : <div className="empty-cart"><span>📦</span><h3>No orders yet.</h3><p>Your completed sandbox orders will appear here while the local server is running.</p></div>}
        <div className="sandbox-note">Demo order history is held in the local server's memory and clears when it restarts. No payment or shipment is created.</div>
      </aside></div>}

      {order && <div className="modal-backdrop" onClick={() => setOrder(null)}><div className="order-modal" onClick={e => e.stopPropagation()}><div className="order-check"><Check size={30}/></div><div className="eyebrow">THAT'S A WRAP</div><h2>Your order is <em>in!</em></h2><p>Thanks for shopping with CartVibes. Your {order.paymentMode === 'RAZORPAY_TEST' ? 'Razorpay test payment and order' : 'demo order'} are confirmed.</p><div className="order-reference"><span>ORDER REFERENCE</span><b>{order.id}</b></div><div className="order-reference"><span>ORDER TOTAL</span><b>{money(order.total)}</b></div><div className="sandbox-note">{order.paymentMode === 'RAZORPAY_TEST' ? 'Test payment only. No real charge or shipment was created.' : 'Demo checkout only. No payment or shipment was created.'}</div><button className="primary-button" onClick={() => setOrder(null)}>Lovely, thanks! <Check size={16}/></button><button className="order-history-link" onClick={() => { setOrder(null); loadOrders(); }}>View all orders</button></div></div>}
    </div>
  );
}
