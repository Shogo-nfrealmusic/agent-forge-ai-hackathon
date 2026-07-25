# Architecture

## Overview

```
┌──────────────────────────── Browser (client) ────────────────────────────┐
│  /                Booking list        (Server Component)                 │
│  /bookings/[id]   Booking detail      (Server) + AnalysisPanel (Client)  │
│  /audit           Audit log           (Server Component)                 │
│                                                                          │
│  The client only ever calls same-origin routes. It never sees a secret.  │
└───────────┬──────────────────┬───────────────────────┬───────────────────┘
            │ POST /api/analyze│ POST /api/decisions   │ POST /api/deliver
            ▼                  ▼                       ▼
┌──────────────────────────── Next.js server ──────────────────────────────┐
│                                                                          │
│  analyzeBooking()          recordDecision()      GATE: findLatestApproval│
│   ├ 1. weather adapter      └ append 1 line to    ├ no approval -> 409    │
│   │    Open-Meteo (no key)    .data/audit-log      ├ deliverMessage()     │
│   │    fail -> fixture        (no network I/O)     │   whatsapp: meta /   │
│   ├ 2. deterministic rules                         │     twilio, or dry   │
│   │    thresholds only, no AI                      │   email: hand-off    │
│   └ 3. AI adapter                                  └ recordDelivery()     │
│        OpenAI-compatible /chat/completions            masked destination, │
│        AI_API_KEY read only here                      length only         │
│        fail / bad JSON -> mock                                            │
└──────────────────────────────────────────────────────────────────────────┘

The only thing ever written is .data/audit-log.jsonl.
There is no connection to a booking system anywhere in this codebase.
```

## The core design decisions

### 1. The rules are the truth; the AI is a second opinion

Risk is assessed twice, independently:

- **Deterministic rules** (`src/lib/risk/rules.ts`) — pure threshold functions. Testable,
  explainable, stable.
- **AI** (`src/lib/ai/adapter.ts`) — produces the judgement call and the customer-facing wording.

The rule result is passed to the AI as context, but **the AI cannot overwrite it**: the rules run
to completion before the AI is called, and the two results are returned in separate fields.

When they disagree, `agreement` becomes `"needs_check"`, the UI shows a large NEEDS CHECK banner,
and `effectiveRiskLevel` reports the **safer of the two**.

This structurally prevents the failure mode "the AI said Low, so we went ahead in a storm".

### 2. Every external dependency has a fallback

| Adapter | Primary | Fallback | How you can tell |
|---|---|---|---|
| weather | Open-Meteo | fixture weather | `weather.source` / `weather.degraded` |
| ai | Qwen Cloud | GMI Cloud, then mock | `ai.provider` / `ai.source` / `ai.fallbackReason` |
| window analysis | Daytona sandbox | trusted local code | `windows.source` / `windows.fallbackReason` |
| delivery | Meta / Twilio | dry run + hand-off link | `result.mode` |

None of them throw. Callers always receive a usable value. With `WEATHER_USE_LIVE=false` and no
API key, the whole app runs offline — which matters when conference Wi-Fi fails mid-demo.

### 3. The mock AI is not a copy of the rules

`src/lib/ai/mock.ts` deliberately uses a **different threshold** (medium at >=60%, the rules use
>=70%).

Two reasons:

- If the mock mirrored the rules, they would always agree and the NEEDS CHECK path could never be
  demonstrated without a live model.
- In production, an AI and a rule engine disagreeing is the normal case. It should be exercised by
  default, not treated as an exception.

`demo-booking-002` (65% chance of rain) is the disagreement case.

### 4. Delivery is a separate, gated action

Approving a recommendation and sending a message are **two different things**. Approving writes one
line to a file and calls nothing. Sending is a distinct request to `/api/deliver`, and it passes
three independent gates:

1. **Approval on record.** The route calls `findLatestApproval(bookingId)` before anything else and
   returns `409` if there is none. This is server-side, so a modified client cannot bypass it.
2. **Provider configured.** No `WHATSAPP_PROVIDER` + credentials → dry run.
3. **Kill switch on.** `DELIVERY_ALLOW_REAL_SEND` must be exactly `"true"` → otherwise dry run.

Dry run means the adapter validates the request, records it, and makes **no network call**. A fresh
clone of this repository cannot message anyone.

The default path in the demo is neither of those: it is a **hand-off link** (`wa.me` /
`mailto:`) that opens the staff member's own client with the draft pre-filled. The human is
unavoidably the one who presses send, and nothing leaves the server at all.

### 5. The audit log is append-only JSONL

One record per line in `.data/audit-log.jsonl`. Never updated, never deleted. Two record kinds
share the file, discriminated by `kind`:

- `decision` — the staff choice plus a snapshot of the rule result, the AI result and the data
  sources at that moment.
- `delivery` — the channel, the mode, the outcome, the **masked** destination, the message
  **length**, and the id of the approving decision.

Both always carry `bookingSystemMutated: false`. A corrupt line is skipped rather than breaking the
audit screen.

Message bodies and full contact details are never written to the log.

## Data flow

### POST /api/analyze

```
{ bookingId } → findBooking()               → 404 if unknown
              → getWeatherForBooking()      (Open-Meteo or fixture)
              → evaluateDeterministicRisk()
              → getAiRecommendation()       (live or mock, zod-validated)
              → { booking, weather, deterministic, ai, agreement,
                  effectiveRiskLevel, delivery: { providers } }
```

`delivery.providers` reports *capability only* (configured? real send on?) — never credentials.

### POST /api/decisions

```
{ bookingId, decision, reason, ...snapshot }
  → zod validation (a reason is mandatory when rejecting)
  → recordDecision() → append 1 line to .data/audit-log.jsonl
  → 201 { entry, bookingSystemMutated: false }
```

No network I/O on this path at all — verified statically and dynamically in
`tests/no-external-calls.test.ts`.

### POST /api/deliver

```
{ bookingId, channel, message }
  → findBooking()                → 404 if unknown
  → findLatestApproval()         → 409 if no approved decision exists   ← THE GATE
  → deliverMessage()             → provider call, or dry run
  → recordDelivery()             → append 1 line (masked destination, length only)
  → 201 { result, entry, bookingSystemMutated: false }
```

## About the weather data

Open-Meteo (`https://api.open-meteo.com/v1/forecast`) is used without an API key.

Fields requested: `precipitation_probability`, `precipitation`, `wind_speed_10m`,
`wind_gusts_10m`, `temperature_2m`, `weather_code`, with `wind_speed_unit=kmh` and the booking's
own `timezone`.

Only the hours overlapping the booking window are aggregated (`10:00-11:30` → the 10:00 and 11:00
slots).

**Limitation:** Open-Meteo does not publish official weather warnings. In this prototype
`WeatherSummary.alerts` comes from fixtures. A production deployment needs a real warnings feed —
see Phase 4 below.

## Adapter contracts for a real booking system

Today this prototype does not even *read* from a booking system. Connecting it should happen in
four phases, in this order.

### Phase 1: BookingReader (read-only)

```ts
interface BookingReader {
  /** Outdoor shoots in a date range. Requires a read-only scope. */
  listUpcoming(range: { from: string; to: string }): Promise<Booking[]>;
  get(bookingId: string): Promise<Booking | null>;
}
```

Requirements:

- Authenticate with a read-only API key or service account — nothing broader
- Customer names, emails and phone numbers must stay inside the process: never in logs, never in
  the audit log, never in an LLM prompt. **The current code puts `customerName` in the prompt**
  (`src/lib/ai/prompt.ts`); replace it with a pseudonymous id before connecting real data
- Rate limiting and caching (re-analysing the same booking within ~15 minutes should hit a cache)

### Phase 2: NotificationDrafter (drafts only, no sending)

```ts
interface NotificationDrafter {
  /** Save a customer message as a draft. Does not send it. */
  createDraft(input: {
    bookingId: string;
    subject: string;
    body: string;
    createdBy: "weather-agent";
  }): Promise<{ draftId: string; reviewUrl: string }>;
}
```

Requirements:

- Do not grant the send scope to this credential
- Drafts must be editable and sendable from the staff UI
- Never add an "auto-send before approval" option

### Phase 3: BookingMutator (propose; a human applies)

```ts
interface BookingMutator {
  /** Create a change proposal. Does not change the booking. */
  proposeChange(input: {
    bookingId: string;
    kind: "reschedule" | "location_change" | "plan_change";
    candidates: { date: string; time: string; location?: string }[];
    rationale: string;
    approvedBy: string;      // staff identifier — required
    auditEntryId: string;    // links back to the audit log — required
  }): Promise<{ proposalId: string }>;

  /** Apply a proposal. Called only from an explicit staff action — never by the agent. */
  applyProposal(proposalId: string, actor: { staffId: string }): Promise<void>;
}
```

Mandatory safety requirements:

- `applyProposal` must be **unreachable from the agent's execution path** — separate module,
  separate credential
- The API must reject any change lacking `approvedBy` and `auditEntryId`
- `proposalId` is the idempotency key, to prevent double application
- Cancellation and refunds stay out of scope: do not build an adapter for them

### Phase 4: WeatherAlertFeed (official warnings)

```ts
interface WeatherAlertFeed {
  getAlerts(input: { latitude: number; longitude: number; date: string }): Promise<string[]>;
}
```

`evaluateDeterministicRisk` already takes `alerts: string[]` as input, so this drops in with no
change to the rules.

### Requirements common to all adapters

- Server-side modules only — a `"use client"` file must not be able to import them
- Always fall back; never throw to the caller
- Credentials from environment variables only, never `NEXT_PUBLIC_`
- Add `actor` and `adapterVersion` to audit records so every change is attributable
