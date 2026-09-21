# CallSend connector — agent contract

CallSend places a real automated phone call on the user's behalf. The agent
prepares everything; the **human** reviews the exact script and the
destination number, then pays on the CallSend website. Placing the call is
irreversible once the provider dials.

## The two operations you get

### 1. Create a draft — `POST /api/calls`

JSON body:

```json
{
  "to": "+15551234567",
  "script": "Hi Maria, this is Jon from Telep IO. Your website draft is ready for review at the link I emailed yesterday. Please call me back at 216-555-0142 when you have a moment. Thanks!",
  "voice": "alloy",
  "record": false
}
```

- `to` must be **E.164**: a leading `+`, then 1–15 digits. The server
  rejects anything else with a plain-language error — show that error to
  the user, do not guess a "corrected" number.
- `script` is **exactly what will be spoken**, 20–1200 characters. Write
  it out fully; the human approves these verbatim words. It is spoken as
  plain text after a short automated-call disclosure
  ("Hi, this is an automated call placed through CallSend…").
- `voice` is optional: one of `alloy`, `echo`, `sage` (default `alloy`).
- `record` is optional (default `false`). When `true` the call is recorded
  and the reviewer gets a recording link after a completed call.

The 201 response is the draft. Keep it — you need it:

```json
{
  "id": "call uuid",
  "token": "bearer token — treat like a password",
  "review_url": "private link for the human reviewer",
  "phone_number": "+15551234567",
  "script_chars": 214,
  "voice": "alloy",
  "record": false,
  "amount_cents": 99,
  "currency": "usd",
  "mode": "demo",
  "state": "draft",
  "terms_version": "…",
  "privacy_version": "…"
}
```

- `amount_cents` is the exact charge: **$0.99 flat per call**, up to 5
  minutes. Quote this number to the user; never invent a price.
- `review_url` is private to the user. Send it to them and stop: the next
  step is theirs, on the website.

### 2. Check status — `GET /api/calls/{id}`

Header: `Authorization: Bearer {token}`. Returns the draft fields above
plus `state`, `provider_status`, `duration_seconds`, `completed` (boolean),
and — only when recording was requested and the provider produced one —
`recording_url`. While the draft is alive it also returns `script`.

**States and what they mean:**

| state | meaning |
|---|---|
| `draft` | created, awaiting human review + payment |
| `checkout` | human started payment, not yet confirmed |
| `paid` | payment confirmed, waiting for the calling window / provider |
| `queued` | submitted to the voice provider, not yet dialed |
| `ringing` / `in-progress` | provider is dialing / the call is connected |
| `completed` | **the provider confirmed the call connected and the script played** — the only state that means "the call happened" |
| `no-answer` | nobody picked up (or the line was busy); a refund is queued automatically |
| `failed` | provider could not place the call; a refund is queued automatically |
| `refund_pending` / `refunded` | refund in flight / completed |
| `needs_review` | something ambiguous happened; a human operator investigates |
| `expired` | draft was never paid and lapsed |

## Pricing

**$0.99 per call**, flat, up to 5 minutes. `GET /api/config` returns
`priceCents` and limits so you can quote before creating a draft. The
server computes the price; the amount in the draft response is authoritative.

## Compliance rules you must follow

- **One call per draft. There is no bulk endpoint.** Never submit the same
  script to many numbers; the server rejects a duplicate (same number +
  same script) drafted within 24 hours.
- **Only call numbers the user gave you.** Never invent, guess, or "fix"
  a rejected number yourself — return the server's error verbatim.
- **No marketing calls, ever.** This connector is for calls the user
  asked for (reminders, confirmations, follow-ups). If the user asks for
  telemarketing, decline.
- **Calling window: 08:00–21:00 recipient-local** (best-effort check).
  Drafts outside the window are rejected; paid calls wait for the window.
- Every call begins with an automated-call disclosure. The human reviewer
  sees the exact script before paying.
- The verbatim script is purged after the call completes; only its
  fingerprint is kept for audit. Phone numbers are purged 30 days after
  terminal states.

## Explicit never-dos

- **Never claim the call was placed because a draft exists.** Only
  `state: "completed"` means the provider confirmed it.
- **Never call `POST /api/calls/{id}/checkout`.** That endpoint is for the
  website after the human's explicit confirmation. It is not an agent action.
- **Never log, repeat, or embed the `token` or the `script`.** Pass the
  token only as the Bearer header. If the user loses the `review_url`,
  they must create a new draft — there is no recovery flow.
- **Never promise call times.** Placement depends on the calling window
  and the provider; the provider reports what it reports.
- **Never submit SSML or markup in the script.** It is spoken as plain
  text.

## Errors

All errors are JSON: `{"error": "human-readable message"}`. 4xx means the
request was wrong (show the message to the user); 503 means retry shortly.
A rejected number, a too-short script, a duplicate draft, or a stale
review are 4xx — do not retry them blindly.

## What the human does (so you can explain it)

1. Opens their private `review_url`.
2. Reads the exact script, the destination number, the voice, and the
   exact price ($0.99).
3. Checks a confirmation box with the full authorization wording.
4. Pays with Stripe. Only then is the call placed — inside the
   08:00–21:00 recipient-local window.

Unpaid drafts expire after 48 hours. No-answer and failed calls are
refunded automatically.
