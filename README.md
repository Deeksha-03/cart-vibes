# CartVibes

A conversational commerce prototype: discover products, compare options, add items to a cart, apply a coupon, and complete a sandbox checkout.

## What's working in this prototype

- Responsive React + Vite shopping experience.
- Conversational shopping assistant with product search/recommendations and simple intent handling.
- Browser voice input (Web Speech API) and spoken responses (Speech Synthesis API). Use Chrome and allow microphone access.
- Express API for catalogue, cart updates, coupon validation, sandbox order creation, and order lookup.
- Demo coupon: `VIBE10` (10% off).
- Optional Agora Conversational AI start endpoint, with Murf Falcon TTS configuration template.

**Important:** checkout is a sandbox action. It does not charge a card, create a real merchant order, or ship goods. Product catalogue and inventory are sample data stored in memory and reset when the server restarts.

## Run locally (Mac)

1. Install Node.js (already installed for this project).
2. Open Terminal and move into the folder where you cloned this repository:
   ```bash
   cd cart-vibes
   ```
3. Install packages:
   ```bash
   npm install
   ```
4. Start the frontend and backend:
   ```bash
   npm run dev
   ```
5. Open **http://localhost:5173** in Chrome.

Stop the app with `Control + C` in Terminal.

## Voice

The default demo uses browser speech recognition and speech synthesis so the end-to-end shopping journey can be tried without API keys. Voice recognition availability depends on browser support and microphone permission.

## Agora + Murf setup (next integration step)

1. Copy `.env.example` to `.env`.
2. Add Agora App ID, Customer ID, Customer Secret, an RTC channel, and a valid RTC token for the agent UID.
3. Add your Murf API key to `MURF_API_KEY`.
4. For the current optional REST start endpoint, configure a published Studio pipeline ID in `AGORA_PIPELINE_ID` if you have one. Otherwise the server sends a starter agent configuration with Murf Falcon TTS and an OpenAI-compatible LLM.
5. Restart the server. The **Test** action beside Agora calls the server endpoint; credentials remain server-side.

The current browser interface does not yet join the Agora RTC channel or stream the agent's audio into the browser. That requires the RTC client/token flow and is a follow-on integration. Do not commit `.env` or expose provider secrets in frontend code.

Agora docs: https://docs.agora.io/en/conversational-ai/overview/product-overview  
Agora join API: https://docs.agora.io/en/api-reference/conversational-ai  
Murf + Agora: https://docs.agora.io/en/ai/models/tts/murf  
Murf API: https://murf.ai/api/docs/text-to-speech/overview

## Project layout

- `src/App.jsx` — storefront, assistant, voice controls, cart and checkout UI.
- `src/styles.css` — responsive styling.
- `server/index.js` — catalogue, cart, coupon, order and optional Agora API routes.
- `.env.example` — names of optional server-side credentials.

## Next milestones

1. Connect Agora Web SDK to the browser and generate RTC tokens on the server.
2. Configure the published Agora agent with Murf Falcon and an LLM.
3. Add proper LLM tool calling for catalogue, inventory, cart, discounts and checkout.
4. Persist carts and orders in a database.
5. Replace sandbox checkout with a payment-provider sandbox integration.
