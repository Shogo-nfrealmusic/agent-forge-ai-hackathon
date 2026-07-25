# Demo script (~6 minutes)

## 0. Setup

```bash
npm install
npm run dev          # http://localhost:3000
```

**No environment variables are needed.** With no `AI_API_KEY` the app uses the mock AI adapter, and
with no WhatsApp provider it uses hand-off links. Everything below works out of the box.

If the venue Wi-Fi is unreliable, go fully offline:

```bash
echo "WEATHER_USE_LIVE=false" >> .env.local
npm run dev
```

To start from a clean slate:

```bash
rm -rf .data
```

---

## 1. Booking list — http://localhost:3000

**Say:**

- Seven mock outdoor shoots. Nothing is connected to a real booking system.
- The badges along the top always show where the data came from and what this instance can do:
  `ai: mock`, `delivery: link hand-off only`.
- Bookings 001–006 use fixture weather so the demo scenarios are stable; 007 has a near date and
  hits the live Open-Meteo API.

---

## 2. High risk — `demo-booking-004` (Enoshima, 85% chance of rain)

Click the card; the analysis runs automatically.

**Point out:**

1. **Weather summary** — 85% chance of rain, with a source badge
2. **Deterministic rule result = HIGH** — and exactly which rule fired:
   "85% chance of rain (>= 80%)"
3. **AI assessment = HIGH** — recommended action `reschedule`, a confidence value, and a
   "Matches the rule result" badge
4. **Message to the customer** — a ready-to-send English draft, currently locked

**Say:**

> We never show the AI's answer alone. The rule result sits next to it. If the model breaks, the
> rules do not, so staff always have a number they can defend.

---

## 3. ★ The disagreement case — `demo-booking-002` (Yoyogi Park, 65%)

**This is the heart of the demo.**

- Deterministic rules = **LOW** (65% is under the 70% threshold)
- AI = **MEDIUM** (it reads 60-something percent as a real risk)
- A yellow **NEEDS CHECK** banner appears at the top
- The recommended action drops to `contact_staff`
- The safer of the two levels (MEDIUM) is reported as the effective level

**Say:**

> When the AI and the rules disagree, we do not silently pick a winner. We hand it back to a human.
> This is how you stop an agent from being confidently wrong.

---

## 4. Severe weather — `demo-booking-006` (Kamakura, typhoon + 42 km/h wind)

- Three rules fire at once and the result is HIGH
- The warning appears in the "Warnings" field

**Say:**

> With multiple hits we take the most severe. Every reason is on screen — nothing is hidden behind
> a score.

---

## 5. Live weather — `demo-booking-007` (Shinjuku Gyoen)

- The badge reads **`source: Open-Meteo`** with no fallback warning
- Real forecast values

**Say:**

> Weather comes from Open-Meteo, no API key required. The other bookings are past its ~16-day
> horizon, so they fall back to fixtures — and the fallback is stated on screen rather than hidden.

> **Note:** if today is after 2026-07-28, update the date in `src/lib/fixtures/bookings.ts` before
> demoing, or this one falls back too.

---

## 6. Staff decision → audit log

Back on `demo-booking-004`, scroll to **Staff decision**.

1. Type a reason, e.g. *"The indoor studio is free that morning, so I would rather offer a location
   change than a new date."*
2. Press **Reject**
   - "Recorded in the audit log" appears, showing `bookingSystemMutated: false`
3. Clear the reason and press **Reject** again
   - It stops with "Please enter a reason before rejecting" — a rejection without a reason cannot be
     recorded
4. Press **Approve**
   - Recorded as `staff approved recommendation (no booking system call was made)`

**Say:**

> None of these buttons calls a booking system, a payment provider or a messaging service. They
> append one line to a local file. That is pinned down by a test that makes `fetch` throw.

---

## 7. ★ Sending the message — the approval gate

Notice what just happened when you pressed Approve: the **Message to the customer** section
unlocked. Before that it was marked *"Locked — approve first"*.

1. Edit the draft in the textarea — what you send is what is in the box
2. Choose the channel: **WhatsApp** (`+15550103`) or **Email** (`demo-four@example.com`)
3. Press **Open in WhatsApp**
   - Your own WhatsApp opens with the message pre-filled. **You** press send.
4. Press **Send via provider**
   - It is disabled, because no provider is configured

**Say:**

> Two paths. The default one sends nothing from our server at all — it hands the draft to the staff
> member's own WhatsApp, so a human is unavoidably in the loop. The API path exists, supports the
> Meta Cloud API and Twilio, and is protected by three gates: an approval must be on record, a
> provider must be configured, and a kill switch must be flipped on. All three default to off.

**Optional — prove the gate is server-side:**

```bash
curl -s -X POST http://localhost:3000/api/deliver \
  -H 'Content-Type: application/json' \
  -d '{"bookingId":"demo-booking-003","channel":"whatsapp","message":"hello"}'
```

```json
{"error":"This booking has no approved decision yet. Approve the recommendation before sending anything to the customer."}
```

> 409. Editing the front end does not get you past it.

---

## 8. Audit log (top navigation)

- Decisions and deliveries in one timeline, newest first
- Decisions show the rule level, the AI level, the recommendation, the reason and the data sources
- Disagreements are tagged **NEEDS CHECK**
- Delivery rows show a **masked** destination (`+1555**03`) and the message **length** — the body is
  never stored
- Every row states `no booking system call was made`

---

## 9. Optional but effective — break something

```bash
AI_BASE_URL=https://127.0.0.1:9/v1 AI_API_KEY=dummy npm run dev
```

Open any booking:

- The AI panel reads "Could not reach the AI provider … the mock adapter was used instead"
- The screen still works — rules, recommendation and draft message are all there

**Say:**

> Weather and AI are both doubled up, so a dead dependency degrades the demo instead of ending it.

---

## 10. The tests

```bash
npm test
```

```
Test Files  10 passed (10)
     Tests  163 passed (163)
```

Worth reading out loud:

- `approving does not send a message — it only unlocks the ability to`
- `makes NO network call when the kill switch is off, even with a provider`
- `the delivery route enforces the approval gate before anything is sent`
- `only reaches the three hosts this app is documented to use`
- `contains no phone number outside the fictional range`
- `no "use client" module reads process.env`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Every booking shows fixture weather | Expected — those dates are past Open-Meteo's ~16-day horizon. Use `demo-booking-007`. |
| The `ai: mock` badge will not go away | Put `AI_API_KEY` in `.env.local` and restart the dev server |
| "Send via provider" is greyed out | No `WHATSAPP_PROVIDER` configured. This is the safe default — use the hand-off link. |
| Delivery returns 409 | There is no approved decision for that booking yet. Press Approve first. |
| The audit log is empty | Check `.data/audit-log.jsonl`. If you deleted it, press Approve again. |
| Port 3000 is taken | `npm run dev -- -p 3001` |
