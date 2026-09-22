# Agent draft interface

This is PaperSend's REST contract, not a claim of a certified Muse connector. The adapter must follow Meta's authenticated developer documentation when available.

## Create a draft

`POST /api/orders`, multipart form with exactly two parts:

- `document`: a PDF file, at most 10 MB / 5 pages. Binary upload only; the server never fetches a supplied document URL.
- `addresses`: a JSON string with `sender` and `recipient` objects. Each requires `name`, `address_line1`, `address_city`, `address_state`, `address_zip`; `address_line2` defaults to empty and `address_country` defaults to `US`.

The response contains `id`, `token`, `review_url`, the submitted addresses, `pages`, `amount` (USD cents), `mode`, `state`, `review_hash`, `terms_version`, and `privacy_version`. Lob's address verification is used internally and its report/standardized result is not exposed. Before submitting a draft, the integration must explain that addresses go to Lob for verification before payment and have the user's authorization to share the content and addresses. Show the price and review link to the user. Never claim the letter was sent merely because a draft was created. Never log the token or private review link.

## Read an order

`GET /api/orders/{id}` with `Authorization: Bearer {token}`. The response omits the token. Only `submitted` means accepted by the printer; it does not mean delivered. Demo/test responses always indicate their mode.

## Human approval

The adapter should expose draft creation and order status only. The user opens `review_url`, checks the document and submitted addresses, explicitly confirms, and pays through the website. `/api/orders/{id}/checkout` is used by the website after confirmation; do not make it an autonomous agent action.

Checkout requires `{confirmed: true, review_hash, terms_version, privacy_version}` from the current review response, with the order bearer token. A boolean alone is rejected. The server records the approved content fingerprint, terms/notice versions, confirmation wording, and time. Stripe also collects terms acceptance. These records bind the request to an order; they do not establish the identity of a human or prove someone read the pages. Do not describe the API as a biometric/human-verification mechanism.

## Proposed directory description

“Print and mail a PDF letter in the United States. PaperSend prepares a private preview and price for your approval, then handles printing, an envelope, and First Class postage. From $4.99. Up to five document pages; no subscription.”

Submission still needs a live domain, operator/support details, verified live fulfillment, authenticated Meta developer requirements, and Meta review.
