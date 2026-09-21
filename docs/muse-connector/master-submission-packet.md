# Muse Connector Submissions — Master Packet

**Generated:** 2026-09-21 (overnight) · **For:** Jon Telep, Telep IO LLC
**Supersedes** the five individual packets from 2026-09-20 (those said Raw API; every connector below is now verified **Existing MCP** with streamable-HTTP, and legal URLs are now per-connector).

## How to use this tomorrow

1. Merge the PR Felipe opens tonight, wait for the Vercel deploy, then open each `https://muse.telep.io/connectors/{slug}/privacy` and `/terms` URL once to confirm they resolve.
2. For each connector below, open the Muse "Submit a connector" form and paste the values. Fields marked ⚠️ are human decisions only you can make.
3. Upload the icon from `docs/muse-connector/icons/{slug}.png` (all 8 are 512×512 PNG, verified).
4. Connection type for **all 8: Existing MCP** (verified live 2026-09-21: HTTP 200, `transport: "streamable-http"`, JSON-RPC `initialize` OK, `tools/list` OK, auth enforced on writes).
5. Read the three Step-3 checkboxes and the Muse Connector Terms yourself before submitting. Nothing here is submitted on your behalf.

## Global values (same for all 8)

| Field | Value |
|---|---|
| Company or developer | Telep IO LLC |
| Your name ⚠️ | Jon Telep |
| Work email ⚠️ | jon@telep.io |
| Support email or URL | jon@telep.io |
| Authentication methods | ✅ API keys |
| API or MCP documentation | `https://muse.telep.io/connectors/{slug}` (the catalog page) |

## Payments decision ⚠️ (one choice, applies to all 8)

**Recommendation: "My connector does not accept payments" — for now.**
Reason: the gateway modules are honest stubs; no Stripe flow exists yet, and Meta does end-to-end functional testing. Selecting "accepts payments" invites them to test a checkout that isn't there. When Stripe is wired per connector, update the listing. If you'd rather signal paid intent now, pick "accepts" — but expect review friction.

## Access requirements (paste into `limits` for each connector)

> Requires a Telep API key (Authorization: Bearer <redacted>). Request one at jon@telep.io. Gateway state is currently in-memory and not durable across restarts. Fulfillment is US-only where physical delivery applies.

Append the connector-specific line under each heading below.

---
## 1. PaperSend

| Field | Value |
|---|---|
| Connector name | PaperSend |
| Product website | https://muse.telep.io/connectors/paper-send |
| Example prompts | Mail this PDF to 1600 Pennsylvania Avenue NW, Washington DC 20500 from my home address. / Prepare a one-page letter to my landlord and give me a review link before anything is printed. / What's the price to mail a 3-page US Letter PDF? / What's the status of my mail job from yesterday? / Show me all my recent mail jobs. |
| Connector icon | `docs/muse-connector/icons/paper-send.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/paper-send/privacy |
| Your terms of service | https://muse.telep.io/connectors/paper-send/terms |
| Anything else? | Demo gateway: creating a job does not print, mail, or charge anything — the agent drafts, the human reviews a private link and pays before any provider is called. REST API also available at https://api.muse.telep.io/v1/paper-send (OpenAPI at …/v1/paper-send/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/paper-send |
| Access requirements | Global text above, plus: Planned pricing $4.99 first page + $0.25 each additional page, US Letter 1–5 pages. Gateway jobs are stubs until the mail provider is wired; live print lives in the separate PaperSend app. |
| Authentication | API keys |

## 2. Sumvid

| Field | Value |
|---|---|
| Connector name | Sumvid |
| Product website | https://muse.telep.io/connectors/sumvid |
| Example prompts | Summarize this YouTube video and pull out the three action items. / What's the thesis of this talk, in six sentences? / Give me the key takeaways from this video. / What did they say about pricing in this video? / Summarize this video for a 5th grader. |
| Connector icon | `docs/muse-connector/icons/sumvid.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/sumvid/privacy |
| Your terms of service | https://muse.telep.io/connectors/sumvid/terms |
| Anything else? | Gateway summaries are demo stubs hashed from the video URL — no captions fetched, no paid API called. REST API also available at https://api.muse.telep.io/v1/sumvid (OpenAPI at …/v1/sumvid/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/sumvid |
| Access requirements | Global text above, plus: read-only summarization; see the Sumvid product for current pricing. |
| Authentication | API keys |

## 3. ShipSignal

| Field | Value |
|---|---|
| Connector name | ShipSignal |
| Product website | https://muse.telep.io/connectors/shipsignal |
| Example prompts | Where is package 1Z999AA10123456784? / Has my USPS package been delivered yet? / Watch my package and tell me when it moves. / Refresh the tracking status on all my parcels. / Stop watching that package. / List all the packages I'm tracking. |
| Connector icon | `docs/muse-connector/icons/shipsignal.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/shipsignal/privacy |
| Your terms of service | https://muse.telep.io/connectors/shipsignal/terms |
| Anything else? | Gateway parcels are demo stubs — timelines hashed from the tracking number; no UPS, USPS, FedEx, or DHL API called yet. REST API also available at https://api.muse.telep.io/v1/shipsignal (OpenAPI at …/v1/shipsignal/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/shipsignal |
| Access requirements | Global text above, plus: read-only tracking; see the ShipSignal product for current pricing. |
| Authentication | API keys |

## 4. SignSend

| Field | Value |
|---|---|
| Connector name | SignSend |
| Product website | https://muse.telep.io/connectors/sign-send |
| Example prompts | Get this contract signed by Alex at alex@example.com. / Prepare a signature envelope for this PDF and give me a review link. / Has Alex signed the contract yet? / Show me all my pending signature envelopes. / Add a second signer to this envelope after Alex signs. |
| Connector icon | `docs/muse-connector/icons/sign-send.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/sign-send/privacy |
| Your terms of service | https://muse.telep.io/connectors/sign-send/terms |
| Anything else? | Demo gateway: envelopes are drafts only — nothing is sent until the human reviews the document, signer list, and $2.99 price and pays. Provider: DocuSign (partner program application in progress, not yet wired). REST API also available at https://api.muse.telep.io/v1/sign-send (OpenAPI at …/v1/sign-send/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/sign-send |
| Access requirements | Global text above, plus: Planned pricing $2.99/envelope; 1–5 sequential signers; up to 5 pages. |
| Authentication | API keys |

## 5. FaxSend

| Field | Value |
|---|---|
| Connector name | FaxSend |
| Product website | https://muse.telep.io/connectors/fax-send |
| Example prompts | Fax this PDF to +1-216-555-0100 with a cover sheet that says 'for records'. / Did my fax to the doctor's office go through? / Show me my recent faxes. / Send this two-page form by fax without a cover page. |
| Connector icon | `docs/muse-connector/icons/fax-send.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/fax-send/privacy |
| Your terms of service | https://muse.telep.io/connectors/fax-send/terms |
| Anything else? | Demo gateway: fax jobs are drafts only — nothing transmits until the human reviews and pays. Provider plan: Sinch Fax API v3 (formerly Phaxio, not yet wired). REST API also available at https://api.muse.telep.io/v1/fax-send (OpenAPI at …/v1/fax-send/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/fax-send |
| Access requirements | Global text above, plus: Planned pricing $0.99 per transmitted page (cover page billable); up to 10 document pages. |
| Authentication | API keys |

## 6. CallSend

| Field | Value |
|---|---|
| Connector name | CallSend |
| Product website | https://muse.telep.io/connectors/call-send |
| Example prompts | Call the pharmacy and read this message verbatim: my prescription should be ready today. Here's the exact script. / Did my call to the pharmacy complete? / Show me my recent calls. / Call me at 6pm with a reminder to take the trash out — here's exactly what to say. |
| Connector icon | `docs/muse-connector/icons/call-send.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/call-send/privacy |
| Your terms of service | https://muse.telep.io/connectors/call-send/terms |
| Anything else? | Trust model: the agent drafts a verbatim TTS script, the human reviews the exact script and pays $0.99 before any call is placed. No autonomous conversation — CallSend reads approved scripts only. Provider: Twilio (account provisioned with a 216 Cleveland local number; SHAKEN/STIR + CNAM deliverability setup in progress; API wiring in progress). REST API also available at https://api.muse.telep.io/v1/call-send (OpenAPI at …/v1/call-send/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/call-send |
| Access requirements | Global text above, plus: Planned pricing $0.99/call; US outbound only; scripted TTS, not conversational. |
| Authentication | API keys |

## 7. InkSend

| Field | Value |
|---|---|
| Connector name | InkSend |
| Product website | https://muse.telep.io/connectors/ink-send |
| Example prompts | Write a thank-you note to my aunt and mail it in handwriting, not a printed letter. / Has my letter to Aunt Mary been mailed yet? / Show me my recent letters. / Send a handwritten birthday card to my dad with this message. |
| Connector icon | `docs/muse-connector/icons/ink-send.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/ink-send/privacy |
| Your terms of service | https://muse.telep.io/connectors/ink-send/terms |
| Anything else? | Demo gateway: letters are drafts only — nothing is mailed until the human reviews and pays. 'Sent' status means accepted for mailing, not delivered. Provider plan: Handwrytten (not yet wired; resale terms to be confirmed). REST API also available at https://api.muse.telep.io/v1/ink-send (OpenAPI at …/v1/ink-send/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/ink-send |
| Access requirements | Global text above, plus: Planned pricing $3.99/letter; US mailing addresses. |
| Authentication | API keys |

## 8. DomainSend

| Field | Value |
|---|---|
| Connector name | DomainSend |
| Product website | https://muse.telep.io/connectors/domain-send |
| Example prompts | Is studio-telep.com available? If so, prepare a registration for me to approve. / What domains do I have registered? / Check if telep.tools is available. / Show me the details on my studio-telep.com registration. |
| Connector icon | `docs/muse-connector/icons/domain-send.png` (upload) |
| Your privacy policy | https://muse.telep.io/connectors/domain-send/privacy |
| Your terms of service | https://muse.telep.io/connectors/domain-send/terms |
| Anything else? | Demo gateway: availability checks and registration drafts only — no real registrations until the human reviews and pays. WHOIS privacy included. Provider plan: OpenSRS reseller track (not yet wired). REST API also available at https://api.muse.telep.io/v1/domain-send (OpenAPI at …/v1/domain-send/openapi.json). |
| Connection type | Existing MCP |
| Hosted MCP endpoint | https://api.muse.telep.io/mcp/domain-send |
| Access requirements | Global text above, plus: Planned pricing $14.99/yr .com; TLDs .com .net .org .io .dev .app .tools; 1–2 year terms. |
| Authentication | API keys |

---

## Step 3 — Review (all 8, read before clicking)

- [ ] I confirm I'm authorized to submit this connector and its brand assets.
- [ ] I understand that submission doesn't guarantee approval and promotion is based on usage and editorial discretion.
- [ ] I agree to the Muse Connector Terms (read https://muse.ai/platform/terms yourself — it was unavailable when last checked).

## Honest readiness note

All 8 endpoints are live and verified tonight. The five *-send connectors plus PaperSend are **honest demo stubs** (no provider fulfillment wired yet); Sumvid/ShipSignal are demo stubs too. Meta performs functional + end-to-end testing, so approval is not guaranteed on stub status — the packets disclose this everywhere rather than hiding it. That was a deliberate call: start the review clock with full disclosure, wire providers as keys land.
