# FaxSend connector — agent contract

FaxSend transmits a black-and-white fax on the user's behalf. The agent
prepares everything; the **human** reviews the rendered pages and the
destination number, then pays on the FaxSend website. Fax transmission is
irreversible once the provider accepts the job.

## The two operations you get

### 1. Create a draft — `POST /api/faxes`

Multipart form with exactly two parts:

- `document`: the PDF to fax. Max **10 MB**, max **10 pages**. Binary upload
  only — the server never fetches a document from a URL you supply. If the
  PDF lives in Gmail, Drive, or elsewhere, download the bytes yourself and
  upload them.
- `to`: JSON string, exactly: `{"fax_number": "+15551234567", "cover_page": true}`
  - `fax_number` must be **E.164**: a leading `+`, then 1–15 digits, e.g.
    `+15551234567`. The server rejects anything else with a plain-language
    error — show that error to the user, do not guess a "corrected" number.
  - `cover_page` is optional (default `false`). When `true`, a cover sheet is
    prepended and **counts as a transmitted page** (see pricing).

The 201 response is the draft. Keep it — you need it:

```json
{
  "id": "fax uuid",
  "token": "bearer token — treat like a password",
  "review_url": "private link for the human reviewer",
  "fax_number": "+15551234567",
  "cover_page": true,
  "pages": 4,
  "amount_cents": 396,
  "currency": "usd",
  "mode": "demo",
  "state": "draft",
  "terms_version": "…",
  "privacy_version": "…"
}
```

- `amount_cents` is the exact charge: **99¢ per page** (cover page included
  when enabled). Quote this number to the user; never invent a price.
- `review_url` is private to the user. Send it to them and stop: the next
  step is theirs, on the website.

### 2. Check status — `GET /api/faxes/{id}`

Header: `Authorization: Bearer {token}`. Returns the draft fields above plus
`state`, `provider_status`, and `delivered` (boolean).

**States and what they mean:**

| state | meaning |
|---|---|
| `draft` | created, awaiting human review + payment |
| `checkout` | human started payment, not yet confirmed |
| `paid` | payment confirmed, queued for transmission |
| `sending` | submitted to the fax provider, not yet confirmed |
| `delivered` | **the provider confirmed transmission** — the only state that means "sent" |
| `failed` | provider could not deliver; a refund is queued automatically |
| `refund_pending` / `refunded` | refund in flight / completed |
| `needs_review` | something ambiguous happened; a human operator investigates |
| `expired` | draft was never paid and lapsed |

## Pricing

**$0.99 per transmitted page.** A 3-page PDF with a cover page is 4 pages =
$3.96. `GET /api/config` returns `pricePerPageCents` and limits so you can
quote before creating a draft. The server computes the price; the amount in
the draft response is authoritative.

## Explicit never-dos

- **Never claim the fax was sent because a draft exists.** Only
  `state: "delivered"` means the provider confirmed transmission.
- **Never call `POST /api/faxes/{id}/checkout`.** That endpoint is for the
  website after the human's explicit confirmation. It is not an agent action.
- **Never log, repeat, or embed the `token`.** Pass it only as the Bearer
  header. If the user loses the `review_url`, they must create a new draft —
  there is no recovery flow.
- **Never "fix" a rejected fax number yourself.** Return the server's error
  verbatim and ask the user for the correct number.
- **Never promise delivery times.** Fax delivery depends on the destination
  line; the provider reports what it reports.
- The server rasterizes the PDF to black-and-white before transmission.
  Scripts, links, forms, and attachments in the original never transmit.
  What the human previews on the review page is pixel-identical to what
  transmits.

## Errors

All errors are JSON: `{"error": "human-readable message"}`. 4xx means the
request was wrong (show the message to the user); 503 means retry shortly.
A rejected fax number, an over-size PDF, or a stale review are 4xx — do not
retry them blindly.

## What the human does (so you can explain it)

1. Opens their private `review_url`.
2. Sees every rendered page, the destination number, and the exact price.
3. Checks a confirmation box with the full authorization wording.
4. Pays with Stripe. Only then does FaxSend transmit.

Unpaid drafts expire after 48 hours. Transmitted documents and the
destination number are purged 30 days after delivery or refund.
