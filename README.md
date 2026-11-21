# CartVibes

CartVibes is a voice-first conversational shopping prototype. This milestone connects the browser microphone to Agora RTC, starts an Agora Conversational AI Platform (Preview) session, and plays the agent's Murf Falcon voice back in the browser.

## Current capabilities

- Responsive React + Vite storefront and sample product catalogue.
- Browser voice fallback using Web Speech APIs.
- **Agora live voice path:** the browser joins an RTC channel, publishes microphone audio, subscribes to the agent's audio, and stops the remote agent session when the call ends.
- A server-side ephemeral Agora agent configuration is created for each call.
- The agent uses Agora-managed Deepgram ASR and OpenAI LLM, plus Murf BYOK with the Falcon TTS model. An OpenAI API key is not required for the live Agora voice agent.
- Existing Express endpoints for catalogue, cart updates, coupon validation, sandbox orders and an optional chat-based LLM shopping assistant.

## Important prototype boundaries

- The live Agora + Murf flow provides real-time voice transport and spoken agent responses, but **shopping tools are not connected to the Agora voice agent yet**. The live agent is explicitly instructed not to claim that it changed a cart or placed an order.
- Product catalogue and inventory are sample in-memory data. Cart and demo orders are local to the running server and reset when it restarts.
- Checkout is sandbox only. No card is charged and no real merchant order or delivery is created.
- Agora's new Conversational AI Platform is in Preview; during Preview, agent sessions run in North America (US). Expect possible additional latency from India.

## Local setup (Mac)

1. Copy `.env.example` to `.env` in the project root.
2. Fill in the Agora, OpenAI and Murf credentials below.
3. Install packages with `npm install`.
4. Start the app with `npm run dev`.
5. Open [http://localhost:5173](http://localhost:5173) in Chrome and allow microphone access.
6. Click the microphone in the assistant panel to start or stop the Agora live voice conversation once credentials are configured. Without credentials, the microphone uses the browser voice fallback.

## Environment variables

| Variable | Where to get it | Purpose |
|---|---|---|
| `AGORA_APP_ID` | Agora Console → Project → Manage credentials | Identifies the Agora project |
| `AGORA_APP_CERTIFICATE` | Same Agora credentials panel | Used by the server to generate RTC tokens |
| `AGORA_ASR_MODEL` | `nova-3` or `nova-2`; default `nova-3` | Deepgram speech-to-text model |
| `AGORA_ASR_LANGUAGE` | Deepgram language code; default `en-IN` | Recognition language |
| `AGORA_LLM_MODEL` | Choose a model supported by Agora managed mode; default `gpt-4o-mini` | Selects the Agora-managed LLM |
| `OPENAI_API_KEY` | OpenAI API dashboard (optional) | Used only by the separate website text-chat endpoint, not live Agora voice |
| `MURF_API_KEY` | Murf API dashboard | Murf Falcon text-to-speech |

`AGORA_AGENT_UID` is a numeric RTC identity reserved for the remote voice agent; the default is `1002`.

The App Certificate, Murf key and optional OpenAI key are read only by the Express server. Do not add real credentials to GitHub or frontend code. The `.env` file is excluded by `.gitignore`.

## Agora voice architecture

When the customer starts a call:

1. Express generates a unique RTC channel and separate publisher tokens for the browser user and remote agent.
2. Express starts an ephemeral Conversational AI Platform session using an Agora ConvoAI token generated server-side from your App ID and App Certificate.
3. The ephemeral agent uses managed Deepgram ASR, OpenAI BYOK for the LLM, and Murf BYOK with model `FALCON` for TTS.
4. The browser joins the same channel with Agora RTC Web SDK, publishes microphone audio and plays the subscribed agent audio.
5. The customer can end the call; the browser leaves RTC and Express requests that Agora stop the agent session.

The implementation follows the current Agora Platform Preview session API, Agora Web RTC SDK 4.x, and Murf's Platform TTS configuration.

## Next milestone

Connect Agora custom tool calling to secure HTTPS shopping endpoints so the voice agent can search the catalogue, check inventory, add items to the cart, apply discounts, and request explicit confirmation before sandbox checkout. Agora's cloud agent needs a publicly reachable HTTPS endpoint for tool calls; localhost alone is not reachable from Agora.

## Run commands

```bash
npm install
npm run dev
```

Stop the dev server with `Control + C`.

## Useful documentation

- Agora Platform overview: https://docs.agora.io/en/ai/platform
- Agora start/stop sessions: https://docs.agora.io/en/ai/platform/get-started/start-stop-agent
- Agora REST API (Preview): https://docs.agora.io/en/api-reference/api-ref/conversational-ai/platform
- Agora RESTful authentication: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/platform/authentication
- Agora Web SDK: https://docs.agora.io/en/realtime-media/rtc/get-started-sdk/web
- Murf Falcon integration: https://docs.agora.io/en/ai/platform/models/tts/murf
