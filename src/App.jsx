import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, AudioLines, Check, CheckCircle2, ChevronDown,
  Headphones, Heart, Mic, MicOff, Minus, Plus, Search, Send, ShoppingBag,
  Sparkles, Star, Trash2, Truck, WandSparkles, X
} from 'lucide-react';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

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
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notice, setNotice] = useState('');
  const [order, setOrder] = useState(null);
  const [voiceMode, setVoiceMode] = useState('Browser voice');
  const [agoraReady, setAgoraReady] = useState(false);
  const chatEnd = useRef(null);
  const recognition = useRef(null);

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

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => {
    fetch('/api/products').then(r => r.ok ? r.json() : null).then(data => data?.products && setProducts(data.products)).catch(() => {});
    fetch('/api/voice/status').then(r => r.json()).then(data => setAgoraReady(Boolean(data.agoraConfigured))).catch(() => {});
    return () => { recognition.current?.stop(); window.speechSynthesis?.cancel(); };
  }, []);

  function say(text) {
    if (!text) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }

  async function addToCart(product, quantity = 1) {
    try {
      const response = await fetch('/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, quantity }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add item');
      setCart(data.cart);
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
      const response = await fetch('/api/cart/items/' + productId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: next }) });
      const data = await response.json();
      if (response.ok) setCart(data.cart);
      else throw new Error(data.error);
    } catch {
      setCart(current => current.map(p => p.id === productId ? { ...p, quantity: next } : p).filter(p => p.quantity > 0));
    }
  }

  async function applyCoupon(code) {
    const response = await fetch('/api/coupons/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, subtotal }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Invalid coupon');
    setCoupon(code.toUpperCase());
    setDiscount(data.discount);
    return data;
  }

  async function checkout() {
    if (!cart.length) return;
    setBusy(true);
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart, coupon, discount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Checkout failed');
      setOrder(data.order);
      setCart([]);
      setDiscount(0);
      setCoupon('');
      setCartOpen(false);
      const text = `You're all set! Your demo order ${data.order.id} is confirmed for ${money(data.order.total)}. This is a sandbox order, no payment was collected.`;
      setMessages(current => [...current, { role: 'assistant', text, kind: 'success' }]);
      say(text);
    } catch (error) {
      setNotice(error.message);
    } finally { setBusy(false); }
  }

  async function processMessage(raw) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setMessages(current => [...current, { role: 'user', text }]);
    setBusy(true);
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, cart }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Assistant unavailable');
      let reply = data.reply;
      if (data.action?.type === 'add_to_cart') {
        const product = products.find(p => p.id === data.action.productId);
        if (product) {
          const added = await addToCart(product, data.action.quantity || 1);
          reply += added ? ` I've added ${product.name} to your bag.` : ' I could not add that item because it may be out of stock.';
        }
      } else if (data.action?.type === 'apply_coupon') {
        try {
          const result = await applyCoupon(data.action.code);
          reply += ` Your discount is ${money(result.discount)}.`;
        } catch (error) { reply += ' ' + error.message + '.'; }
      } else if (data.action?.type === 'show_cart') {
        setCartOpen(true);
        reply += ` Your bag has ${count} item(s), with a subtotal of ${money(subtotal)}.`;
      } else if (data.action?.type === 'checkout') {
        reply += ' Open your bag and select Place demo order when you are ready.';
        setCartOpen(true);
      }
      setMessages(current => [...current, { role: 'assistant', text: reply, products: data.products || [] }]);
      say(reply);
    } catch {
      const fallback = "I had trouble reaching the shopping service. You can still browse the products and add items using the buttons.";
      setMessages(current => [...current, { role: 'assistant', text: fallback }]);
    } finally { setBusy(false); }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice input is not supported in this browser. Try Chrome on your laptop.');
      setTimeout(() => setNotice(''), 3500);
      return;
    }
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const instance = new SpeechRecognition();
    instance.lang = 'en-IN';
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    instance.onstart = () => setListening(true);
    instance.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setListening(false);
      processMessage(transcript);
    };
    instance.onerror = () => { setListening(false); setNotice('I could not hear that clearly. Please try again.'); setTimeout(() => setNotice(''), 2500); };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    instance.start();
  }

  async function startAgora() {
    try {
      const response = await fetch('/api/voice/agora/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Agora is not configured yet');
      setNotice('Agora agent start requested. Agent ID: ' + (data.agent_id || 'starting'));
    } catch (error) {
      setNotice(error.message);
    }
    setTimeout(() => setNotice(''), 4500);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><ShoppingBag size={19}/></span><span>cart<span className="brand-accent">vibes</span><i>.</i></span></a>
        <nav className="nav-links"><a className="active" href="#discover">Discover</a><a href="#how">How it works</a><a href="#about">Our vibe</a></nav>
        <div className="top-actions">
          <button className="icon-button" aria-label="Search" onClick={() => document.getElementById('product-search')?.focus()}><Search size={19}/></button>
          <button className="bag-button" onClick={() => setCartOpen(true)}><ShoppingBag size={18}/><span>My bag</span><b>{count}</b></button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot"/> THE FUTURE OF FEEL-GOOD SHOPPING</div>
            <h1>Good finds.<br/><em>Great vibes.</em></h1>
            <p className="hero-description">Skip the endless scrolling. Tell us what you're looking for, and let's find your next favourite thing.</p>
            <div className="hero-cta">
              <button className="primary-button" onClick={() => document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth' })}>Shop with Vibe <Sparkles size={17}/></button>
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
          <div className="assistant-card">
            <div className="assistant-left">
              <div className="assistant-head"><div className="vibe-avatar"><AudioLines size={23}/><span/></div><div><b>Vibe</b><small><span className="online-dot"/> Here for your next great find</small></div><span className="powered-pill"><Sparkles size={12}/> AI SHOPPING ASSISTANT</span></div>
              <div className="chat-window">
                {messages.map((message, index) => <div className={'message-row ' + message.role} key={index}>
                  {message.role === 'assistant' && <div className="mini-avatar"><AudioLines size={14}/></div>}
                  <div className={'message-bubble ' + (message.kind || '')}>{message.text}
                    {message.products?.length > 0 && <div className="chat-product-list">{message.products.map(p => <button key={p.id} onClick={() => addToCart(p)}><span>{p.emoji}</span><span><b>{p.name}</b><small>{money(p.price)}</small></span><Plus size={15}/></button>)}</div>}
                  </div>
                </div>)}
                {busy && <div className="message-row assistant"><div className="mini-avatar"><AudioLines size={14}/></div><div className="message-bubble typing"><i/><i/><i/></div></div>}
                <div ref={chatEnd}/>
              </div>
              <div className="chat-compose">
                <button className={'mic-button ' + (listening ? 'listening' : '')} onClick={startListening} title="Speak to Vibe">{listening ? <MicOff size={19}/> : <Mic size={19}/>}</button>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && processMessage(input)} placeholder={listening ? 'Listening…' : 'Tell Vibe what you have in mind'} />
                <button className="send-button" onClick={() => processMessage(input)} disabled={!input.trim() || busy}><Send size={17}/></button>
              </div>
              <div className="voice-foot"><span><span className="sound-bars"><i/><i/><i/><i/></span> {listening ? 'Listening to you…' : speaking ? 'Vibe is speaking…' : 'Voice + chat, your choice'}</span><span>EN · INDIA</span></div>
            </div>
            <div className="assistant-right">
              <div className="right-kicker">A GOOD PLACE TO START</div><h3>What's your<br/>shopping mood?</h3><p>Pick a prompt or ask for anything. Vibe's all ears.</p>
              <div className="prompt-list">
                {['Find comfy sneakers under ₹2,500','I need a cute everyday bag','Show me desk accessories','What can I get for under ₹1,000?'].map((prompt, i) => <button key={prompt} onClick={() => processMessage(prompt)}><span>{['👟','👜','🪴','✨'][i]}</span>{prompt}<ArrowRight size={15}/></button>)}
              </div>
              <div className="assistant-note"><WandSparkles size={17}/><span><b>Not sure yet?</b> That's okay. Tell Vibe a little about your day, your budget, or what you love.</span></div>
              <div className="voice-integrations"><div className="integration-title">VOICE EXPERIENCE <span className="live-indicator"/> </div><div className="integration-row"><span className="integration-icon"><AudioLines size={15}/></span><span><b>Browser voice</b><small>Ready for a live demo</small></span><span className="integration-status ready">READY</span></div><div className="integration-row"><span className="integration-icon agora"><Headphones size={15}/></span><span><b>Agora Conversational AI</b><small>{agoraReady ? 'Server credentials detected' : 'Connect credentials to activate'}</small></span><button className="connect-link" onClick={startAgora}>Test</button></div><div className="integration-caption">Murf Falcon TTS is configured through the Agora agent settings.</div></div>
            </div>
          </div>
        </section>

        <section className="discover-section" id="discover">
          <div className="discover-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> THE GOOD STUFF</div><h2>Find your <em>favourite.</em></h2><p>A few lovely things to get you started.</p></div><div className="catalog-search"><Search size={17}/><input id="product-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the edit…"/></div></div>
          <div className="category-row">{categories.map(category => <button key={category} className={activeCategory === category ? 'selected' : ''} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
          <div className="product-grid">{visibleProducts.map((product, index) => <article className="product-card" key={product.id}>
            <div className={'product-art ' + product.color}><span className="product-tag">{product.tag}</span><button className="heart-button" aria-label="Save item"><Heart size={17}/></button><div className="product-emoji">{product.emoji}</div><span className="art-index">0{index + 1}</span></div>
            <div className="product-info"><div className="product-category">{product.category}</div><h3>{product.name}</h3><div className="rating"><Star size={13} fill="currentColor"/> {product.rating} <span>({product.reviews} reviews)</span></div><div className="product-buy"><div><b>{money(product.price)}</b><del>{money(product.oldPrice)}</del></div><button onClick={() => addToCart(product)} disabled={product.stock === 0}>{product.stock === 0 ? 'Sold out' : <><Plus size={16}/> Add</>}</button></div></div>
          </article>)}</div>
          {visibleProducts.length === 0 && <div className="empty-search">No finds just yet. Try another search or category.</div>}
        </section>

        <section className="how-section" id="how"><div className="how-top"><div className="eyebrow"><span className="eyebrow-dot"/> THE CARTVIBES WAY</div><h2>Less searching.<br/><em>More finding.</em></h2><p>Shopping should feel like talking to someone who just gets you.</p></div><div className="how-steps"><div><span>01</span><b>Tell us your vibe</b><p>Share what you need, what you love, and what you'd like to spend.</p></div><div><span>02</span><b>Get the good picks</b><p>Compare thoughtful recommendations, without the endless scroll.</p></div><div><span>03</span><b>Make it yours</b><p>Add to your bag, use a deal, and place a sandbox order.</p></div></div></section>
      </main>

      <footer id="about"><a className="brand" href="#"><span className="brand-mark"><ShoppingBag size={17}/></span><span>cart<span className="brand-accent">vibes</span><i>.</i></span></a><span>GOOD FINDS. GREAT VIBES. © 2026 CARTVIBES</span><span>MADE FOR THE WAY YOU SHOP NOW ✳</span></footer>

      {notice && <div className="toast"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}

      {cartOpen && <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="eyebrow">YOUR LITTLE COLLECTION</span><h2>My bag <span>({count})</span></h2></div><button className="close-button" onClick={() => setCartOpen(false)}><X/></button></div>
        {cart.length ? <><div className="cart-items">{cart.map(item => <div className="cart-item" key={item.id}><div className={'cart-thumb ' + item.color}>{item.emoji}</div><div className="cart-item-details"><b>{item.name}</b><small>{money(item.price)} each</small><div className="quantity-control"><button onClick={() => updateQuantity(item.id, -1)}><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)}><Plus size={13}/></button></div></div><div className="cart-item-end"><b>{money(item.price * item.quantity)}</b><button onClick={() => updateQuantity(item.id, -item.quantity)}><Trash2 size={15}/></button></div></div>)}</div>
        <div className="coupon-box"><label htmlFor="coupon">GOT A LITTLE CODE?</label><div><input id="coupon" value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Try VIBE10"/><button onClick={async () => { try { const d = await applyCoupon(coupon); setNotice('You saved ' + money(d.discount) + '!'); } catch (e) { setNotice(e.message); } }}>Apply</button></div><small>Demo code: VIBE10 · 10% off your bag</small></div>
        <div className="cart-summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{savings > 0 && <div><span>Product savings</span><b className="saving">−{money(savings)}</b></div>}{discount > 0 && <div><span>VIBE10 discount</span><b className="saving">−{money(discount)}</b></div>}<div className="total-row"><span>Total</span><b>{money(total)}</b></div><button className="checkout-button" onClick={checkout} disabled={busy}>{busy ? 'Placing order…' : 'Place demo order'} <ArrowRight size={17}/></button><p><Truck size={14}/> Sandbox checkout · No real payment collected</p></div></> : <div className="empty-cart"><span>🛍️</span><h3>Your bag is taking a little breather.</h3><p>Let's find something you'll love.</p><button className="primary-button" onClick={() => { setCartOpen(false); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }); }}>Explore the edit <ArrowRight size={16}/></button></div>}
      </aside></div>}

      {order && <div className="modal-backdrop" onClick={() => setOrder(null)}><div className="order-modal" onClick={e => e.stopPropagation()}><div className="order-check"><Check size={30}/></div><div className="eyebrow">THAT'S A WRAP</div><h2>Your order is <em>in!</em></h2><p>Thanks for shopping with CartVibes. Your demo order has been created successfully.</p><div className="order-reference"><span>ORDER REFERENCE</span><b>{order.id}</b></div><div className="order-reference"><span>ORDER TOTAL</span><b>{money(order.total)}</b></div><div className="sandbox-note">This is a sandbox checkout. No payment was taken and no real shipment will be created.</div><button className="primary-button" onClick={() => setOrder(null)}>Lovely, thanks! <Check size={16}/></button></div></div>}
    </div>
  );
}
