# InkSend — robot-handwritten letters, ordered by an agent

**Status: SCAFFOLD.** The full agent-draft → human-review → Stripe-payment →
provider-fulfillment pipeline is built and smoke-tested in demo mode. The
handwriting provider integration is a **stub** — no provider has been
contacted, no accounts exist, no live calls are made. See
`TERMS-DILIGENCE.md` before anything live.

## What it is

InkSend is a Muse connector for sending **handwritten letters**. The user
tells their agent who the letter is for and what it should say; the agent
creates a draft; the human reviews the exact message and address on a
website and pays **$3.99 per letter**; a handwriting robot then writes the
letter in real ink and mails it First Class.

## How it differs from Paper Send

Paper Send prints and mails documents — the right tool for invoices,
contracts, and anything that should look typed. InkSend is its emotional
sibling: thank-you notes, condolences, congratulations, love letters,
holiday cards, apologies. Same trust architecture (agent drafts, human
reviews and pays, provider fulfills), different job: **a typed email feels
wrong, a stamp feels right.**

## Flow

1. `POST /api/letters` — agent submits `{message, to, card?, handwriting_style?}` → draft + private `review_url`.
2. Human opens the review page: message rendered in a handwriting-style
   **preview** (clearly labeled as a preview), recipient address, card, and
   the exact $3.99 price. Checks the confirmation box, pays via Stripe.
3. The worker submits the approved message to the handwriting provider with
   a stable idempotency key (`letter-{id}`).
4. Agent polls `GET /api/letters/{id}`. Only `state: "sent"` means the
   provider accepted the letter. **Delivery is not tracked** — First Class
   mail doesn't report it, and we say so honestly instead of guessing.

## Trust model (mirrors Paper Send)

- The agent can only **create drafts and check status**. `/checkout` is a
  website-only action, gated by the human's explicit confirmation.
- Fulfillment requires: Stripe payment confirmed via signed webhook **plus**
  an approval fingerprint match — message SHA-256, recipient address
  fingerprint, card/handwriting options, price, policy versions, and the
  exact confirmation wording. Any drift → `needs_review`.
- Idempotency keys on checkout (`checkout-{id}`), provider submission
  (`letter-{id}`), and refunds (`refund-{id}`).
- Tokens are SHA-256 hashed at rest and never returned in status responses.
- Failed provider jobs queue automatic refunds.
- Message text and recipient address are purged 30 days after a terminal
  state; the approval fingerprint remains as proof of what was sent.

## Project layout

```
ink-send/
├── README.md               # this file
├── TERMS-DILIGENCE.md      # week-one provider-terms gate (resolve before live)
├── docs/connector.md       # the agent-facing contract
├── policies/               # terms.html / privacy.html (demo placeholders)
├── public/index.html       # human review page
├── schema.sql              # SQLite schema (letters, approvals, policies)
└── src/
    ├── index.js            # boot
    ├── app.js              # routes, helmet, rate limits, webhooks
    ├── config.js           # demo/test/live modes + live-mode gates
    ├── approval.js         # confirmation wording, canonical JSON, review hash
    ├── letters.js          # state machine + worker
    ├── providers.js        # Stripe (real) + handwriting provider (demo stub)
    └── store.js            # node:sqlite store
```

## Run it (demo)

```sh
npm install
npm start          # APP_MODE=demo by default — no external calls
```

Open `POST /api/letters` with a JSON body, then follow the `review_url`.
Demo checkout marks the letter paid and the worker walks it to `sent`.

## Not built yet

- Handwriting provider integration (`src/providers.js` — demo stubs only,
  throws outside demo mode by design).
- Real terms/privacy (demo placeholders in `policies/`).
- Handwrytten reseller/integration terms confirmed in writing
  (`INK_AUTHORIZATION_REFERENCE`; live mode refuses to boot without it).
- Postgres swap for production (same query shapes as `src/store.js`).
