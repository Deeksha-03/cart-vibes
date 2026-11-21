# CartVibes

CartVibes is a local conversational shopping demo. Vibe uses Agora Conversational AI for live speech recognition and conversation, Murf Falcon for spoken replies, and the local storefront API for product, cart, coupon, and order actions.

## What works

- Floating Vibe assistant, available across the storefront.
- English and Kannada selection. Kannada uses Agora ASR language `kn` and Murf Neeta / `kn-IN` / Conversational / Falcon 2.1.
- One live voice session per conversation: the Agora RTC microphone stays published while the session is active, so Vibe keeps listening across turns and can be interrupted. Tap **End call** to stop manually; after an order confirmation, the call closes.
- Transcript text comes from the Agora client toolkit and RTM/RTC events. Final user turns are sent to Express and recorded per voice session; browser speech recognition is not used and raw audio is not stored.
- Local product discovery, cart changes, VIBE10 coupon, order history, demo checkout, and optional Razorpay test checkout.
- Voice commands such as “add it” resolve against the latest recommendation on the server and open the updated bag. Repeated transcript events are idempotent. Saying “order it” starts checkout; Razorpay still requires payment approval.
- Razorpay is restricted to test key IDs. The server creates the payment order from the live cart, verifies the signature and captured payment status, and only then records the order.

## Run locally

1. Put credentials in a root-level `.env` file. `dotenv` does not load `.env.example`.
2. Ensure Agora Conversational AI and Signaling are enabled for the Agora project.
3. Run `npm install`, then `npm run dev`.
4. Open **http://localhost:5173** in Chrome and allow microphone access.
5. Open Vibe, select English or Kannada, then press the large **Talk to Vibe** button. Keep speaking naturally; the session remains open until the order completes or you end the call.

Use `localhost`, not a LAN address such as `http://10.x.x.x:5173`. Chrome only treats localhost or HTTPS as a secure origin for microphone access. If Chrome already blocked the old LAN origin, open the localhost URL and allow the microphone for that origin.

## Server environment

| Variable | Purpose |
|---|---|
| `AGORA_APP_ID` | Agora RTC and Conversational AI project |
| `AGORA_APP_CERTIFICATE` | Server-side Agora RTC/RTM/agent token generation |
| `AGORA_LLM_MODEL` | Agora-managed LLM model; default `gpt-4o-mini` |
| `AGORA_ASR_LANGUAGE` | English ASR language; default `en-IN` |
| `AGORA_ASR_MODEL` | Agora-managed Deepgram ASR model; default `nova-3` |
| `AGORA_AGENT_UID` | RTC identity reserved for the agent; default `1002` |
| `MURF_API_KEY` | Server-side Murf Falcon TTS credential |
| `MURF_VOICE_ID` | English Murf voice; default `Matthew` |
| `MURF_LOCALE` | English Murf locale; default `en-US` |
| `RAZORPAY_KEY_ID` | Optional Razorpay test key; must start with `rzp_test_` |
| `RAZORPAY_KEY_SECRET` | Optional Razorpay test secret |

No separate OpenAI API key is used. The LLM stage is configured as Agora-managed; the provider name in Agora's pipeline is `openai`, but credentials and model requests are managed by Agora.

Keep credentials in `.env`, which is ignored by Git. Never commit live credentials or put them in frontend code. If credentials were placed in the tracked `.env.example`, rotate them and move the replacements to `.env`.

## Voice and shopping flow

1. The browser requests short-lived RTC and RTM tokens from Express, joins Agora RTC, and publishes the microphone continuously.
2. Express starts an Agora Conversational AI RTC session with Agora-managed Deepgram ASR and LLM plus Murf BYOK TTS (`FALCON`, Falcon 2.1). The session enables `properties.advanced_features.enable_rtm` and `properties.parameters.data_channel: "rtm"` so the Web toolkit receives transcript events.
3. The Agora client toolkit displays the live transcript and posts completed user turns to `POST /api/voice/transcript`. Express records each turn, runs the same assistant resolver used by typed chat, and applies cart additions before returning the verified cart. `GET /api/voice/transcripts/:sessionKey` retrieves the session transcript.
4. Checkout stays in test/demo mode. Razorpay test payments are verified server-side before order fulfillment; without test credentials, the local demo checkout is used.

Agora cloud function tools require a public HTTPS endpoint. This local demo intentionally keeps shopping APIs on the local server; Agora transcripts are forwarded to Express so the server can apply and verify cart actions without exposing the cart API publicly.

The catalogue, inventory, cart, and order history are in memory and reset when the server restarts. Real Agora and Murf sessions need an internet connection and can incur usage; use **End call** when done. Agora Conversational AI is in Preview, so model availability and latency can vary.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

Stop the dev server with `Control + C`.

## Provider documentation

- Agora Conversational AI: https://docs.agora.io/en/conversational-ai/overview/product-overview
- Agora start/stop agent: https://docs.agora.io/en/ai/build/start-stop-agent
- Agora Web client toolkit: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/client-toolkit/web
- Agora Signaling Web SDK: https://docs.agora.io/en/realtime-media/rtm
- Agora–Murf integration: https://docs.agora.io/en/ai/models/tts/murf
- Murf Falcon 2.1: https://murf.ai/api/products/text-to-speech/falcon-2
- Razorpay Standard Checkout: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps
