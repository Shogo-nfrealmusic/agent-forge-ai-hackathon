# Security & Safety

This prototype is built around one priority: **the AI must never act on a booking or a customer by
itself**. Below is what is guaranteed, and how each guarantee is pinned down by a test.

---

## 1. No side effects on any booking system

### Guarantees

- No code exists that changes, cancels or refunds a booking
- Approve / Reject / Needs discussion write to exactly one place: the local file
  `.data/audit-log.jsonl`
- Every audit record carries `bookingSystemMutated: false`

### How it is enforced

- `src/lib/audit/store.ts` and `src/app/api/decisions/route.ts` contain no `fetch()` at all
- No SDK for Stripe, Slack, Google Calendar, Resend, Twilio, SendGrid or nodemailer is a dependency
  (the supported WhatsApp providers are reached over plain `fetch`, so they add no SDK either)

### Tests (`tests/no-external-calls.test.ts`)

- With `fetch` replaced by a spy that throws on any call, all three decisions are recorded and the
  spy is never called
- Static scan: no `fetch(` / `XMLHttpRequest` on the decision path
- Static scan: no forbidden SDK appears in any import statement
- Static scan: the app references **only** the hosts it documents (Open-Meteo, the two WhatsApp
  providers, and documentation links) — an undocumented host fails the build

---

## 2. Outbound messaging cannot fire without a human

This is the part that changed when WhatsApp delivery was added, so it carries the most guardrails.

### The three gates

| # | Gate | Enforced where | Default |
|---|---|---|---|
| 1 | An **approved** decision must exist for this booking | `src/app/api/deliver/route.ts` (server) → `409` if missing | no approval exists |
| 2 | A provider must be fully configured | `readWhatsAppConfig()` → dry run if not | not configured |
| 3 | `DELIVERY_ALLOW_REAL_SEND` must be exactly `"true"` | `isRealSendEnabled()` → dry run if not | `false` |

In dry run the adapter validates the request and records it, but performs **no network call**. A
fresh clone of this repository cannot message anyone.

The gate lives on the server, so editing the client cannot bypass it.

### The default demo path sends nothing from the server

The UI's primary action is a **hand-off link** — a `wa.me` click-to-chat URL or a `mailto:` URL
with the draft pre-filled. It opens the staff member's own client; they press send. No provider
account, no API key, and no outbound request from this application.

### Email has no provider adapter, deliberately

The original brief for this prototype forbade connecting to email services. WhatsApp was added
later as an explicit requirement, so it has a real adapter; email keeps the original constraint and
stays hand-off only. `src/lib/delivery/email.ts` documents the `EmailSender` interface to implement
if that changes — the gates, audit records and masking around it need no modification.

### Tests (`tests/delivery.test.ts`, `tests/no-external-calls.test.ts`)

- No provider configured → `fetch` is never called
- Kill switch off → `fetch` is never called, even with a provider configured
- The kill switch only accepts the exact string `"true"` (`"TRUE"`, `"1"`, `"false"` all stay off)
- A non-E.164 number or an empty message fails before any network call
- Approving a recommendation does not send anything; it only makes a later send possible
- Static: the deliver route calls `findLatestApproval` **before** `deliverMessage`, and always calls
  `recordDelivery`

---

## 3. Secrets stay on the server

### Rules

- `AI_API_KEY` and the WhatsApp/Twilio credentials are read **only** in server-only modules under
  `src/lib/ai/`, `src/lib/delivery/` and `src/app/api/`
- No credential is ever given a `NEXT_PUBLIC_` prefix (Next.js inlines those into the browser
  bundle)
- No `"use client"` module reads `process.env`
- Provider error response bodies are never surfaced to the UI — some providers echo the credential
  back in an error

### How it is enforced

- `ai/adapter.ts` and `delivery/whatsapp.ts` each have a `typeof window !== "undefined"` runtime
  guard that throws immediately if the module is ever bundled for the browser
- Credentials travel in the `Authorization` header only — never in a URL or a request body
- `.gitignore` excludes `.env*` and re-includes only `!.env.example`

### Tests (`tests/no-secret-exposure.test.ts`, `tests/delivery.test.ts`, `tests/ai-adapter.test.ts`)

- No `"use client"` module contains `process.env`
- No `"use client"` module imports the AI adapter, the audit store, or the WhatsApp/email adapters
- No `NEXT_PUBLIC_*` variable contains `API_KEY` / `SECRET` / `TOKEN` / `PASSWORD` / `CREDENTIAL`
- Any file reading a credential env var must live in an allow-listed server directory
- No `sk-`, `sk-ant-`, `AIza` or `ghp_` shaped literal exists in the source
- `next.config.ts` does not re-export env vars to the client
- `.env.example` ships every secret-shaped variable **empty**, and `DELIVERY_ALLOW_REAL_SEND=false`
- The API key and the WhatsApp token never appear in a request URL or body
- A provider returning `401` with the token echoed in the body does not leak it into the UI message

---

## 4. No real customer data

### Rules

- `customerName` must start with `Demo`
- `customerEmail` must use a domain reserved by RFC 2606 (`example.com`, …)
- `customerPhone` must be in **`+1-555-01XX`**, the North American range reserved for fiction — so
  a number in this repo can never route to a real person. This matters much more now that the app
  can actually send WhatsApp messages.
- No address, postal code, date of birth or payment field exists on the model

### Tests (`tests/no-real-customer-data.test.ts`)

- Every fixture's name, email domain, phone range and id format is checked
- Phone numbers must be unique per booking (so a demo cannot accidentally message one number
  repeatedly)
- The **whole source tree** is scanned: no email outside the reserved domains, no phone number
  outside the fictional range (the Twilio sandbox sender is the one documented exception), no
  Japanese-format phone number

### Before connecting real data

`src/lib/ai/prompt.ts` currently includes `customerName` in the LLM prompt. With mock data that is
harmless; with real data it sends a customer's name to a third-party model. Replace it with a
pseudonymous id first. See Phase 1 in [`architecture.md`](architecture.md).

---

## 5. AI output is treated as untrusted input

| Control | Implementation |
|---|---|
| Enforce structure | `response_format: { type: "json_object" }` plus strict zod validation |
| Tolerate fences and prose | `extractJsonObject()` pulls the first JSON object out |
| Normalise quirks | Uppercase enums, numeric strings, 0-100 confidence values |
| On validation failure | Discard the response, fall back to mock, show the reason in the UI |
| Force human review | `requiresHumanReview` is overwritten to `true` server-side |
| Keep the rules independent | The rule result is computed before the AI runs and cannot be modified by it |
| On disagreement | `agreement: "needs_check"` → a prominent NEEDS CHECK banner |

### Not covered (prototype limitation)

- **No content filtering on `customerMessage`.** A prompt-injection attack on the weather or
  booking data could in principle steer the drafted wording. Mitigations in place: a staff member
  reads the message before it is sent, and the message is fully editable in the UI. A production
  system should add outbound content checks as well.
- Output is rendered as plain text in a `<textarea>`, so React's escaping applies and it is not an
  XSS vector.

### Tests (`tests/ai-schema.test.ts`)

Thirteen malformed shapes — empty string, prose only, truncated JSON, arrays, `null`, numbers,
missing fields, unknown enum values, out-of-range confidence, wrong types — are all rejected
safely, without throwing.

---

## 6. The audit log

- Append-only. There is no update or delete API.
- Rejecting requires a reason (enforced by a zod `refine`; whitespace-only is refused too)
- Each record snapshots the rule result, the AI result and the data sources at decision time
- Delivery records store a **masked** destination (`+1555**03`) and the message **length** only —
  never the body, never the full phone number or email
- Corrupt lines are skipped on read, so the audit screen cannot be broken by a bad write
- `.data/` is gitignored — decisions are never committed

### Not covered (prototype limitation)

- **No authentication**, so there is no `actor` field recording *who* approved something. This is
  mandatory before real use.
- No tamper-evidence (hash chaining) on the log.
- On serverless hosting the filesystem is ephemeral; the log must move to a database.

---

## 7. Every host this app can reach

| Host | Purpose | Auth | How to disable |
|---|---|---|---|
| `api.open-meteo.com` | Weather forecast | none | `WEATHER_USE_LIVE=false` |
| `AI_BASE_URL` (default DashScope) | Generate the recommendation | Bearer token | leave `AI_API_KEY` empty |
| `graph.facebook.com` | WhatsApp Cloud API | Bearer token | leave `WHATSAPP_PROVIDER` empty |
| `api.twilio.com` | Twilio WhatsApp | Basic auth | leave `WHATSAPP_PROVIDER` empty |

With none of those configured, the app runs completely offline. A test fails the build if any other
host appears in the source.

---

## 8. Deployment checklist

- [ ] Put `AI_API_KEY` and any provider credentials in the host's environment settings, never in the
      repository
- [ ] Confirm no `NEXT_PUBLIC_` credential exists (`npm test` checks this automatically)
- [ ] Decide deliberately about `DELIVERY_ALLOW_REAL_SEND`. **Leave it `false` for demos.** Turning
      it on means real messages reach real phones.
- [ ] Replace the fictional phone numbers before pointing this at real customers, and complete
      Phase 1 of the architecture doc (pseudonymise the customer name in the prompt) first
- [ ] Point `.data/` at a persistent volume, or move the audit log to a database — serverless
      filesystems are ephemeral
- [ ] This prototype has **no authentication**. Put it behind access control before exposing it on a
      public URL.
