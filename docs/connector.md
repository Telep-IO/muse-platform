# InkSend connector — agent contract

InkSend mails a **robot-handwritten letter** on the user's behalf: the message
is written in real ink by a handwriting robot and sent by First Class mail.
The agent prepares everything; the **human** reviews the exact message and
the recipient address, then pays on the InkSend website. Mailing is
irreversible once the handwriting provider accepts the job.

## The two operations you get

### 1. Create a draft — `POST /api/letters`

JSON body, `Content-Type: application/json`:

```json
{
  "message": "Dear Ana, thank you for the wonderful weekend…",
  "to": {
    "name": "Ana Rivera",
    "address_line1": "123 Lake Ave",
    "address_line2": "Apt 4",
    "city": "Cleveland",
    "state": "OH",
    "zip": "44113",
    "country": "US"
  },
  "card": "thank-you",
  "handwriting_style": ""
}
```

- `message`: **required**, 10–2000 characters. This is the **exact text the
  robot will write** — spelling, line breaks, and all. Read it back to the
  user before creating the draft; you cannot edit it afterwards.
- `to`: **required**. `name`, `address_line1`, `city`, `state`, `zip` are
  required; `address_line2` is optional; `country` defaults to `US`. For US
  addresses the ZIP must look like `44113` or `44113-1234` — the server
  rejects anything else with a plain-language error. Show that error to the
  user verbatim; never guess a "corrected" address.
- `card`: optional — `plain-letter` (default), `thank-you`, `condolence`, or
  `holiday`.
- `handwriting_style`: optional short label (max 64 chars). Leave empty for
  the default hand.

The 201 response is the draft. Keep it — you need it:

```json
{
  "id": "letter uuid",
  "token": "bearer token — treat like a password",
  "review_url": "private link for the human reviewer",
  "to": { "name": "Ana Rivera", "address_line1": "123 Lake Ave", "city": "Cleveland", "state": "OH", "zip": "44113", "country": "US" },
  "card": "thank-you",
  "message_preview": "Dear Ana, thank you for the wonderful weekend…",
  "amount_cents": 399,
  "currency": "usd",
  "mode": "demo",
  "state": "draft",
  "review_hash": "…",
  "terms_version": "…",
  "privacy_version": "…"
}
```

- `amount_cents` is the exact charge: **$3.99 flat per letter**. Quote this
  number to the user; never invent a price.
- `message_preview` is truncated for chat display; the full text is what
  sends. The human sees the full text on the review page, rendered in a
  handwriting-style preview.
- `review_url` is private to the user. Send it to them and stop: the next
  step is theirs, on the website.

### 2. Check status — `GET /api/letters/{id}`

Header: `Authorization: Bearer {token}`. Returns the draft fields above plus
`state`, `provider_status`, and `sent` (boolean).

**States and what they mean:**

| state | meaning |
|---|---|
| `draft` | created, awaiting human review + payment |
| `checkout` | human started payment, not yet confirmed |
| `paid` | payment confirmed, queued with the handwriting provider |
| `sending` | submitted to the handwriting provider, not yet confirmed |
| `sent` | **the provider accepted the letter** for handwriting + First Class mailing — the only state that means "it will go out" |
| `failed` | provider could not accept the job; a refund is queued automatically |
| `refund_pending` / `refunded` | refund in flight / completed |
| `needs_review` | something ambiguous happened; a human operator investigates |
| `expired` | draft was never paid and lapsed |

**There is no "delivered" state.** Letters travel by First Class mail, which
does not report delivery. Never imply you know when (or whether) a letter
arrived — say "accepted for mailing" and nothing more.

## Pricing

**$3.99 per letter, flat.** No per-page math, no subscription.
`GET /api/config` returns `priceCents`, the card options, and message limits
so you can quote before creating a draft. The server computes the price; the
amount in the draft response is authoritative.

## Explicit never-dos

- **Never claim the letter was mailed because a draft exists.** Only
  `state: "sent"` means the provider accepted it.
- **Never claim delivery.** InkSend does not track delivery. "It was accepted
  for mailing" is the strongest true statement.
- **Never call `POST /api/letters/{id}/checkout`.** That endpoint is for the
  website after the human's explicit confirmation. It is not an agent action.
- **Never log, repeat, or embed the `token`.** Pass it only as the Bearer
  header. If the user loses the `review_url`, they must create a new draft —
  there is no recovery flow.
- **Never edit or "improve" the message.** The exact approved text is what
  the robot writes. If the user wants changes, create a new draft.
- **Never "fix" a rejected address yourself.** Return the server's error
  verbatim and ask the user for the correct address.
- **Never promise handwriting samples, specific pens, or mailing dates**
  beyond what `/api/config` and the status endpoint report.
- The preview on the review page is a handwriting-style **rendering**, not
  the finished product. The finished letter is written in real ink by a
  handwriting robot — say so plainly.

## Errors

All errors are JSON: `{"error": "human-readable message"}`. 4xx means the
request was wrong (show the message to the user); 503 means retry shortly.
A too-short message, a bad ZIP, or a stale review are 4xx — do not retry
them blindly.

## What the human does (so you can explain it)

1. Opens their private `review_url`.
2. Reads the full message (rendered in a handwriting-style preview, clearly
   labeled as a preview) and checks the recipient address, card, and price.
3. Checks a confirmation box with the full authorization wording.
4. Pays with Stripe. Only then does InkSend submit the letter.

Unpaid drafts expire after 48 hours. The message text and recipient address
are purged 30 days after mailing, refund, or expiry.

## Good uses

Thank-you notes, condolences, congratulations, love letters, holiday cards,
apologies, invitations — anywhere a typed email feels wrong and a stamp
feels right. If the user needs a printed business document instead, that is
Paper Send's job, not this connector's.
