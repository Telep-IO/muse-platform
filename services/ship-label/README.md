# ShipLabel fulfillment service

Express app that stores shipment drafts and buys a USPS label through EasyPost after Stripe reports a paid checkout. It is not an npm workspace and the Next.js gateway must not import it. The gateway calls `SHIP_LABEL_SERVICE_URL` over HTTP.

```bash
npm install
npm test
npm start
```

Copy `.env.example` to `.env` for local demo. Leave secrets empty in git. Demo mode makes no EasyPost or Stripe calls. Do not set `APP_MODE=live` until the Forge Order Form reference is real.
