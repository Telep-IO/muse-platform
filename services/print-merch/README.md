# PrintMerch fulfillment

Express app for PrintMerch. Not an npm workspace and not imported by the Next.js gateway. The gateway calls it over `PRINT_MERCH_SERVICE_URL`.

```sh
npm install
npm test
npm start
```

Copy `.env.example` to `.env` and leave secrets empty until they are set in the host environment.
