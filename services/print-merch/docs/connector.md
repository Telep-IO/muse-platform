# PrintMerch

Muse designs custom printed merchandise: pick a product, upload artwork, preview mockups, and get a live quote. A person reviews the design and pays through Stripe. Only then is the order sent to Printify for printing and white-label shipping.

Demo mode is fully stubbed and never contacts Printify. You must own or be licensed for any artwork you upload.

## Pricing

`total = live base + live shipping + markup`

Markup defaults to 25% (`MARKUP_BPS=2500`) of base plus shipping. Base and shipping are read from Printify for that order. They are not hardcoded. The same formula works whether or not the shop has Printify Premium.

## Production timing

Printify shops auto-send new orders after 24 hours unless order approval is Manual. This service refuses to boot in test and live unless the shop payload reports manual approval. `send_to_production` runs only after a Stripe webhook with `payment_status` paid, and only after a durable claim row is stored.

## Shipping

`send_shipping_notification` is false. Telep IO LLC is the merchant of record. Production time varies by print provider.

## Cancellation

Only while Printify still shows on-hold or payment-not-received.

## Artwork

Checkout requires `artwork_rights_attested: true`. The buyer attests they own or are licensed for the design.
