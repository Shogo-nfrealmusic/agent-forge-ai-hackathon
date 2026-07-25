# Weather Booking Adjustment Agent

A human-in-the-loop AI agent for outdoor photo-shoot studios. It reads a booking and the weather
forecast for that exact window, assesses the risk to the shoot, proposes an action, and drafts a
message for the customer. **A staff member decides. The agent never does.**

> **This app never changes, cancels or refunds a booking.**
> It is not connected to any booking site or internal system — everything runs on fixtures and
> mock data.

---

## What it does

1. Lists mock bookings
2. Fetches the forecast for the booking window (Open-Meteo, with a fixture fallback)
3. Scores the risk as **Low / Medium / High** using deterministic rules — no AI involved
4. Asks an AI for an assessment, a recommended action and a draft customer message
5. Shows both results side by side, and flags **NEEDS CHECK** when they disagree
6. Lets a staff member choose **Approve / Reject / Needs discussion**
7. Records the decision in a local append-only audit log
8. **After an approval**, lets the staff member send the message over WhatsApp or email

The AI never decides anything on its own, and no message can reach a customer without a staff
approval already on record.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — it runs fully offline with no config
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the test suite (vitest, 163 tests) |
| `npm run typecheck` | Type-check without emitting |

A five-minute demo script is in [`docs/demo.md`](docs/demo.md).

---

## Environment variables

All of these are read **server-side only**. None may ever be prefixed with `NEXT_PUBLIC_`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AI_API_KEY` | no | *(empty)* | Unset → the mock AI adapter is used |
| `AI_BASE_URL` | no | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Any OpenAI-compatible endpoint (Qwen Cloud by default) |
| `AI_MODEL` | no | `qwen-plus` | Model name |
| `WEATHER_USE_LIVE` | no | `true` | `false` forces the fixture path (fully offline) |
| `DELIVERY_ALLOW_REAL_SEND` | no | `false` | **Master kill switch.** Unless exactly `"true"`, provider calls are simulated |
| `WHATSAPP_PROVIDER` | no | *(empty)* | `meta` or `twilio`. Empty → hand-off links only |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | no | — | WhatsApp Business Cloud API |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | no | — | Twilio WhatsApp |
| `AUDIT_LOG_PATH` | no | `./.data/audit-log.jsonl` | Where the audit log is written |

See [`docs/security.md`](docs/security.md) for the full reasoning.

---

## The deterministic rules (no AI involved)

| Condition | Level |
|---|---|
| A severe-weather warning is active (typhoon, storm) | **High** |
| Thunderstorm (WMO code 95 / 96 / 99) | **High** |
| Max wind >= 30 km/h | **High** |
| Chance of rain >= 80% | **High** |
| Chance of rain >= 70% | **Medium** |
| None of the above | **Low** |

When several rules fire, the highest level wins. Implementation:
[`src/lib/risk/rules.ts`](src/lib/risk/rules.ts)

---

## AI response contract

The AI is required to return exactly this shape, and it is **validated with zod**. Anything that
fails validation is discarded and the mock adapter takes over.

```json
{
  "riskLevel": "low | medium | high",
  "summary": "short reasoning",
  "recommendation": "keep | reschedule | plan_change | contact_staff",
  "customerMessage": "draft message to the customer",
  "confidence": 0.0,
  "requiresHumanReview": true
}
```

`requiresHumanReview` is forced to `true` server-side even if the model returns `false`.

---

## Sending the message to the customer

Two paths, both requiring an approved decision first.

### 1. Hand-off links (default, zero configuration)

The UI builds a `wa.me` click-to-chat link or a `mailto:` link with the draft pre-filled. It opens
the staff member's own WhatsApp or mail client, and **they** press send. Nothing leaves this
server. This works with no accounts, no API keys and no provider setup.

### 2. Provider API (opt-in, off by default)

`POST /api/deliver` can send through a real provider, but only when **three gates** all pass:

1. The booking already has an **approved** decision in the audit log (server-enforced; otherwise
   the route returns `409`)
2. A provider is fully configured (`WHATSAPP_PROVIDER` + its credentials)
3. `DELIVERY_ALLOW_REAL_SEND` is exactly `"true"`

If gate 2 or 3 fails, the adapter runs in **dry run**: it validates everything, records the attempt
in the audit log, and makes no network call at all. A fresh clone of this repo cannot message
anyone.

Supported: **WhatsApp Business Cloud API** (Meta) and **Twilio WhatsApp**, both over plain `fetch`
— no SDK dependency. **Email has no provider adapter by design**; it stays hand-off only. See
[`src/lib/delivery/email.ts`](src/lib/delivery/email.ts) for the interface to implement if you
want to add one.

Every delivery attempt is written to the audit log with a **masked** destination (`+1555**03`) and
the message **length only** — the body is never stored.

---

## Fallback behaviour

| Failure | What happens |
|---|---|
| `AI_API_KEY` not set | Mock adapter, badge shown in the UI |
| AI provider unreachable / times out | Falls back to mock, reason shown in the UI |
| AI returns a non-2xx | Falls back to mock (the response body is never surfaced — it can echo the key) |
| AI returns non-JSON or an off-schema payload | Falls back to mock |
| Weather API fails or the date is out of range | Falls back to fixture weather, `degraded` badge shown |
| Weather response is malformed | Falls back to fixture weather |
| No WhatsApp provider configured | Dry run; the hand-off link still works |
| Provider call fails | Recorded as `failed` in the audit log; the UI stays usable |

**No failure breaks the screen.**

---

## Project layout

```
src/
├── app/
│   ├── page.tsx                  Booking list
│   ├── bookings/[id]/page.tsx    Booking detail
│   ├── audit/page.tsx            Audit log
│   └── api/
│       ├── analyze/route.ts      Weather + rules + AI (server only)
│       ├── decisions/route.ts    Staff decisions (local file only, no network)
│       └── deliver/route.ts      Message delivery (approval gate lives here)
├── components/
│   ├── AnalysisPanel.tsx         Client UI — never touches a secret
│   └── badges.tsx
└── lib/
    ├── analysis.ts               Orchestration
    ├── risk/rules.ts             Deterministic rules
    ├── weather/open-meteo.ts     Weather adapter + fallback
    ├── ai/{adapter,schema,mock,prompt}.ts    AI adapter
    ├── delivery/{contact,whatsapp,email}.ts  Delivery adapters
    ├── audit/store.ts            Append-only audit log
    └── fixtures/{bookings,weather}.ts
tests/                            vitest (163 tests)
docs/{architecture,security,demo}.md
```

---

## Tests

```bash
npm test
```

What is covered:

- Low / Medium / High classification, including the 69/70/79/80% and 29/30 km/h boundaries
- Thunderstorm, strong wind, severe-weather warnings and high rain probability
- AI failure modes (unreachable, non-2xx, timeout, empty, non-JSON, off-schema) all fall back to mock
- **Approving calls no external API** — a `fetch` spy plus static source analysis
- **Approving does not send a message**; it only unlocks the ability to
- **The delivery approval gate**: no approval on record → nothing is sent
- **Nothing is sent** without a configured provider *and* the kill switch on
- Provider tokens never appear in a URL or a request body, and error bodies are never echoed
- Reject reasons are persisted; rejecting without a reason is refused
- No real customer data anywhere (emails, phone numbers, postal codes — whole source tree)
- No secret can reach the browser (`"use client"` modules cannot read `process.env`)
- Malformed AI responses are handled safely (13 shapes)
- The app only reaches hosts it documents

---

## Out of scope (on purpose)

- Changing, cancelling or refunding a booking
- Connecting to a real booking system
- Stripe, Slack or Google Calendar
- An email sending provider (hand-off only — see above)
- Real customer data
- Authentication and user management (prototype)

The adapter contracts needed to connect this to a real booking system are in
[`docs/architecture.md`](docs/architecture.md).

---

## Status

Hackathon prototype. Not built for production use.
