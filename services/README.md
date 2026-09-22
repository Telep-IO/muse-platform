# services/

Separately deployed Express fulfillment backends for CallSend, DomainSend, FaxSend, InkSend, PaperSend, and SignSend.

They are **not** part of the Vercel Next.js build and they are **not** npm workspaces. Root `package.json` keeps `workspaces` at `packages/*` and `connectors/*` only, so `express`, `pg`, and these apps' Stripe clients stay out of the Vercel install. Do not import this tree from `app/`, `connectors/`, or `packages/`.

Each directory was added with `git subtree add` from its standalone [Telep-IO](https://github.com/Telep-IO) repository. The original scaffold commit is a parent of that merge, and the service source was not rewritten. The standalone repositories stay up until Jon archives them after this change is merged and health-checked.

| Directory | npm name | What the source repo contained |
| --- | --- | --- |
| `services/call-send` | `callsend` | `package.json`, lockfile, root `schema.sql`, `docs/`, `policies/`, `public/`, `src/` |
| `services/domain-send` | `domainsend` | `package.json`, lockfile, `docs/`, `policies/`, `public/`, `src/` (Postgres schema at `src/schema.postgres.sql`) |
| `services/fax-send` | `faxsend` | `package.json`, lockfile, root `schema.sql`, `docs/`, `public/`, `src/`. No `policies/` directory in the source repo. |
| `services/ink-send` | `inksend` | `package.json`, lockfile, root `schema.sql`, `docs/`, `public/`, `scripts/`, `src/`. No `policies/` directory in the source repo. |
| `services/paper-send` | `papersend` | `package.json`, `pnpm-lock.yaml`, `Dockerfile`, `compose.yaml`, `compose.deploy.yaml`, `deploy/`, `docs/`, `policies/`, `public/`, `scripts/`, `src/` (Postgres schema at `src/schema.postgres.sql`), `assets/`, tests |
| `services/sign-send` | `signsend` | `package.json`, lockfile, `docs/`, `policies/`, `public/`, `src/` (Postgres schema at `src/schema.postgres.sql`) |

CallSend, DomainSend, FaxSend, InkSend, and SignSend did not ship a Dockerfile. PaperSend is the furthest along: it includes a Dockerfile, compose files, and Lob/Stripe fulfillment wiring. Putting that tree in `services/paper-send` changes the code location only. Where PaperSend is deployed does not change.

Install from the service directory (`npm install` or PaperSend's pnpm lockfile, then that app's own `start` script). Root `npm install` does not install these dependencies. `.env.example` files are empty placeholders; do not commit real keys.

The agent-facing MCP and REST stubs stay in `connectors/{slug}` and keep `/mcp/{slug}` and `/v1/{slug}`. `connectors/paper-send` is the stub. `services/paper-send` is the Express app. Do not import this tree from the stub.
