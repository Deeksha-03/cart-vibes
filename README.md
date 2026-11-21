# CartVibes

A voice-first conversational shopping companion built with React, Express and Agora Conversational AI.

## Product experience

Choose English (India) or Kannada (India), then have a live voice conversation with Vibe. The app streams microphone audio through Agora RTC, displays the live transcript over Agora Signaling (RTM), and plays Vibe's responses using Murf Falcon 2.1.

Vibe can use the CartVibes shopping tools to:
- Discover in-stock sample products and filter by budget.
- Compare products using current sample price, rating, stock and description.
- Add items to the cart when explicitly asked.
- Apply the demo coupon `VIBE10` (10% off).
- Read the cart and prepare a checkout summary.
- Place a sandbox order only after explicit customer confirmation.

## Voice stack

| Function | Provider / model |
|---|---|
| RTC audio transport | Agora Web RTC SDK |
| Live transcripts | Agora Signaling (RTM) + Conversational AI client toolkit |
| STT | Agora-managed Deepgram Nova-3 |
| LLM | Agora-managed OpenAI `gpt-4o-mini` |
| TTS | Murf Falcon 2.1, voice `Neeta`, style `Conversational` |
| Kannada recognition | Deepgram Nova-3 language `kn` |
| Kannada speech | Murf Neeta locale `kn-IN` |
| English (India) | Deepgram `en-IN` + Murf Neeta `en-IN` |

Neeta's Falcon 2.1 voice supports both `kn-IN` and `en-IN`. The language selector chooses the ASR language, TTS locale and response-language instruction for each new conversation.

## Important implementation notes

- The stable Conversational AI Engine `/join` and `/leave` endpoints are used. The browser joins RTC, publishes the microphone, logs in to RTM and subscribes to transcript messages before the agent starts.
- Agent custom tools use Agora's synchronous HTTPS tool calling. Set `AGORA_PUBLIC_BASE_URL` to a public HTTPS tunnel URL pointing to this Express server. An Agora cloud agent cannot call `localhost`.
- The agent tool endpoint is protected by `AGORA_TOOL_SHARED_SECRET`, passed only to Agora from the server. It is never exposed to browser code.
- The catalogue/inventory and cart/order stores are in-memory demo data. They reset when the backend restarts.
- Checkout creates a sandbox order only. It does not charge a card, place a real merchant order or arrange shipping.
- The website does not track page clicks or browsing activity. Customers control actions by voice or text.

## Local setup (Mac)

1. Copy `.env.example` to `.env` in the project root if you do not already have one. Keep your real values only in `.env`.
2. Fill `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, and `MURF_API_KEY`.
3. Install dependencies: `npm install`.
4. Start frontend and backend: `npm run dev`.
5. Open [http://localhost:5173](http://localhost:5173) in Chrome and allow microphone access.
6. Select English or Kannada and press the microphone button.

The live voice call and transcript work with the three provider credentials. For voice-driven cart/coupon/checkout actions, expose the local backend over HTTPS (see next section).

## Expose the local shopping API to Agora

Agora's cloud service needs to reach the tool endpoint. For local testing, run an HTTPS tunnel to port 3001 (for example, using ngrok or Cloudflare Tunnel).

Then set these values in `.env`:

```env
AGORA_PUBLIC_BASE_URL=https://your-public-tunnel-domain
AGORA_TOOL_SHARED_SECRET=replace-with-a-long-random-secret
```

Generate the secret locally with:

```bash
openssl rand -hex 32
```

Restart `npm run dev` after editing `.env`. The `/api/voice/status` endpoint reports whether shopping tools are enabled. Do not use `http://localhost:3001` for `AGORA_PUBLIC_BASE_URL`.

## Environment variables

| Variable | Purpose |
|---|---|
| `AGORA_APP_ID` | Agora project identifier |
| `AGORA_APP_CERTIFICATE` | Server-side RTC, RTM and ConvoAI token generation |
| `AGORA_AGENT_UID` | Numeric agent UID; default 1002 |
| `AGORA_ASR_MODEL` | Deepgram model; default `nova-3` |
| `AGORA_LLM_MODEL` | Agora-managed LLM; default `gpt-4o-mini` |
| `MURF_API_KEY` | Murf API key |
| `MURF_VOICE_ID` | Default `Neeta` |
| `MURF_MODEL` | Default `falcon-2.1` (Murf's canonical Falcon 2.1 identifier) |
| `MURF_STYLE` | `Conversational` |
| `AGORA_PUBLIC_BASE_URL` | Public HTTPS base URL for agent tool calls |
| `AGORA_TOOL_SHARED_SECRET` | Secret protecting the shopping tool endpoint |
| `OPENAI_API_KEY` | Optional; only for separate website text-chat fallback |

Never commit `.env` or share real credentials. The repository's `.gitignore` excludes it.

## Run commands

```bash
npm install
npm run dev
```

Stop the local app with `Control + C`.

## Sandbox ordering safety

The agent first prepares a checkout preview and reads the total. It must ask the customer for explicit confirmation before calling the order placement tool. The backend verifies the short-lived confirmation code, checks the cart has not changed, and creates a sandbox-only order.

## References

- Agora Conversational AI Engine: https://docs.agora.io/en/conversational-ai/overview/product-overview
- Agora REST authentication: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/authentication
- Agora custom tools: https://docs.agora.io/en/ai/build/tools/custom-tools
- Agora live transcripts: https://docs.agora.io/en/ai/build/transcripts
- Agora Web RTC SDK: https://docs.agora.io/en/realtime-media/rtc/get-started-sdk/web
- Agora Signaling: https://docs.agora.io/en/realtime-media/rtm/quickstart/web
- Murf Falcon 2.1: https://murf.ai/api/docs/text-to-speech/web-sockets
- Murf voice library: https://murf.ai/api/docs/voices-styles/voice-library
