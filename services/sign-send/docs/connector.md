# Agent draft interface

This is SignSend's REST contract, not a claim of a certified Muse connector. The adapter must follow Meta's authenticated developer documentation when available.

**Status: SCAFFOLD.** The fulfillment provider is not integrated yet (see `TERMS-DILIGENCE.md`). Draft creation, review, demo payment, and the status state machine work in demo mode; no real signature request is sent anywhere.

## Create a draft

`POST /api/envelopes`, multipart form with exactly two parts:

- `document`: a PDF file, at most 10 MB / 5 pages. Binary upload only; the server never fetches a supplied document URL.
- `signers`: a JSON string with an array of 1–5 signer objects. Each requires `name` and `email`. Signing is sequential in array order; a signature field and a date field are auto-placed for each signer.

The response contains `id`, `token`, `review_url`, the submitted signers, `pages`, `amount` (USD cents, always 299), `mode`, `state`, `review_hash`, `terms_version`, and `privacy_version`. Before submitting a draft, the integration must explain that signers will receive a signature request email after payment and have the user's authorization to share the document and the signers' contact details. Show the price ($2.99) and review link to the user. Never claim the document was sent for signing merely because a draft was created. Never log the token or private review link.

## Read an envelope

`GET /api/envelopes/{id}` with `Authorization: Bearer {token}`. The response includes per-signer status (`pending`, `signed`, `declined`) and a `signed_count`, but omits the token. Only `signed` means every signer has signed as confirmed by the provider. `sent` means signers have been notified; it does not mean anyone has signed. Demo/test responses always indicate their mode.

## Human approval

The adapter should expose draft creation and envelope status only. The user opens `review_url`, checks the rendered document pages and the signer list, explicitly confirms, and pays through the website. `/api/envelopes/{id}/checkout` is used by the website after confirmation; do not make it an autonomous agent action.

Checkout requires `{confirmed: true, review_hash, terms_version, privacy_version}` from the current review response, with the envelope bearer token. A boolean alone is rejected. The server records the approved content fingerprint, terms/notice versions, confirmation wording, and time. Stripe also collects terms acceptance. These records bind the request to an envelope; they do not establish the identity of a human or prove someone read the pages. Do not describe the API as a biometric/human-verification mechanism.

If a signer declines, the envelope is closed and the payment is refunded automatically; signing can never resume on a declined envelope.

## Proposed directory description

“Collect e-signatures on a PDF. SignSend prepares a private preview and signer list for your approval, then sends the document for sequential signing at a flat $2.99 per envelope. No subscription.”

Submission still needs a live domain, operator/support details, a provider with a confirmed white-label/partner track, verified live fulfillment, authenticated Meta developer requirements, and Meta review.
