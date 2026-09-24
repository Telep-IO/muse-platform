# GiftSend fulfillment service

Standalone Express app. It is not an npm workspace and nothing under `app/`, `connectors/`, or `packages/` imports it. The gateway calls it over `GIFT_SEND_SERVICE_URL`.

Demo mode stores drafts in SQLite and does not call Tremendous or Stripe. Test mode uses the Tremendous sandbox at `https://testflight.tremendous.com/api/v2`. Live mode uses `https://api.tremendous.com/api/v2` and refuses to boot until `TREMENDOUS_PLATFORM_CLIENT_REFERENCE` is set after Platform Client registration with Tremendous Sales.

Orders are created only after a Stripe webhook with `payment_status` `paid`. The service inserts a claim row before `POST /orders` and sends that claim id as Tremendous `external_id`. Funding is the prefunded Tremendous balance (`BALANCE`). The service does not top up that balance by card.

See `docs/connector.md` and `policies/`.
