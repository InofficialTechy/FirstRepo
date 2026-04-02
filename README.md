# Free Voice Assistant (Next.js + Vercel)

Production-ready, globally deployable, **free-tier friendly** voice assistant web app.

## Stack
- **Frontend**: Next.js (App Router), React, Tailwind CSS
- **Voice input**: Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
- **Voice output**: Browser SpeechSynthesis API
- **AI brain**:
  - Primary: Hugging Face Inference API (free tier, optional)
  - Fallback: local rule-based intent + response logic (always available)
- **Commands**: time, YouTube, Google search, weather by city
- **Weather API**: Open-Meteo (free, no API key)
- **Backend**: Vercel serverless routes (`/api/brain`, `/api/weather`)

## Privacy
- No database.
- No permanent storage.
- Requests are processed in-memory and discarded after response.
- See comments in API route files for data handling notes.

## Folder Structure

```text
.
├── app/
│   ├── api/
│   │   ├── brain/route.ts      # HF proxy + fallback responses
│   │   └── weather/route.ts    # Open-Meteo proxy
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── AssistantApp.tsx        # Main assistant UI + voice logic
├── lib/
│   └── intents.ts              # Intent detection + fallback rules
├── .env.example
├── vercel.json
└── README.md
```

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome.

## Environment Variables (Optional)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Only needed if you want LLM replies from Hugging Face:

- `HUGGINGFACE_API_TOKEN` (optional)
- `HUGGINGFACE_MODEL` (optional override)

If token is missing, app remains fully functional with command + rule-based responses.

## Features Checklist

- ✅ Continuous listening mode via SpeechRecognition
- ✅ Clean mic permission/error handling
- ✅ Speech synthesis output with best-voice selection heuristics
- ✅ Wake-word simulation (`Hey Assistant`)
- ✅ Intent detection for required commands
- ✅ Typing fallback when mic is unavailable
- ✅ Dark mode toggle
- ✅ Stateless serverless architecture for Vercel

## Command Examples
- "Hey Assistant, what time is it?"
- "Hey Assistant, open YouTube"
- "Hey Assistant, search Google for Vercel edge functions"
- "Hey Assistant, weather in San Francisco"

## One-command Vercel Deploy

```bash
npx vercel --prod
```

(First run prompts for project linking; subsequent runs are one command.)

## Notes for Production
- SpeechRecognition support is strongest in Chrome/Chromium browsers.
- Mobile browser support varies by OS/browser version.
- If HF free tier is rate-limited, fallback responses automatically keep assistant responsive.
