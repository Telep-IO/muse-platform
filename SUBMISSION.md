# Muse connector submission

Copy this file per connector when filing with Meta’s [Muse Connector Platform](https://muse.ai/platform). Replace the braces. Do not claim Meta partnership or directory placement in the listing copy.

## Connector

- **Name:** {PaperSend}
- **Slug:** `{paper-send}`
- **Operator:** Telep IO · jon@telep.io
- **Repo:** {https://github.com/Telep-IO/paper-send}
- **Catalog page:** https://muse.telep.io/connectors/{slug}
- **Status (Telep):** planned | building | submitted | ready

## What it does

{One paragraph. Example: Print and mail a PDF letter in the United States. The agent prepares a draft; the human reviews pages, addresses, and price, then pays. The agent cannot skip review.}

## How Muse should use it

{Bullet the agent-facing actions. Drafts and status only. Human review + payment before irreversible provider work.}

Example prompts:

1. {…}
2. {…}
3. {…}

## Gateway URLs (production)

Use the shared Telep edge, not a laptop:

| Surface | URL |
| --- | --- |
| REST base | `https://api.muse.telep.io/v1/{slug}` |
| OpenAPI | `https://api.muse.telep.io/v1/{slug}/openapi.json` |
| MCP (streamable HTTP) | `https://api.muse.telep.io/mcp/{slug}` |
| Health | `https://api.muse.telep.io/health` |
| Auth | `Authorization: Bearer muse_sk_{env}_{token}` |

Index of all connectors: `https://api.muse.telep.io/v1`

## Privacy & terms

Use the per-connector pages in the Muse form (not the platform-wide notices):

- Connector privacy: https://muse.telep.io/connectors/{slug}/privacy
- Connector terms: https://muse.telep.io/connectors/{slug}/terms
- Platform privacy (footer / catalog-wide): https://muse.telep.io/privacy
- Platform terms (footer / catalog-wide): https://muse.telep.io/terms

## Trust model (keep this)

- Agent may create drafts and read status.
- Human reviews exact content, destination, and price.
- Payment gates the provider call.
- Status language stays honest (`stubbed` / `draft` ≠ mailed, faxed, or signed).

## Checklist before Meta review

- [ ] Registry entry merged
- [ ] Gateway module callable on `api.muse.telep.io` (or documented as catalog-only)
- [ ] Demo key is not a production secret
- [ ] Live provider terms / diligence recorded in the product repo
- [ ] No copy that says Telep is a Meta partner
