# Terms diligence — do this in week one, before any live build

**Rule: do not build live provider integration, take test/live payments, or submit a connector application until the items below are confirmed in writing.**

## The question

Which reseller platform permits operating a **paid, customer-facing domain registration service** on their API — i.e., Jon's customers pay Jon, Jon's backend registers domains through the reseller account? Unlike print, fax, or e-signature APIs, domain reselling is a platform's *entire business model* (OpenSRS/Tucows exists to power resellers), so the terms risk here is structurally lower. Verify anyway: "built for resellers" is not the same as "this specific API tier, pricing, and use case are approved."

## Candidate

1. **OpenSRS (Tucows)** — reseller API with a test environment. Confirm the reseller account tier, API access, and per-TLD wholesale pricing.

## What to look for (in order of preference)

- [ ] **Reseller onboarding path**: how to open a reseller account, whether there is an application, accreditation, or deposit/minimum.
- [ ] **Test/sandbox environment** access and how to get test credentials.
- [ ] **Wholesale pricing per TLD** (at least: com, net, org, io, dev, app, tools) — verify the retail table in `src/config.js` leaves a maintainable margin after wholesale + Stripe (~$0.45 + tax handling).
- [ ] **API terms / reseller agreement**: quote the exact sections covering customer-facing resale, branding requirements, and prohibited uses.
- [ ] **Registrant verification flow**: what emails the registry sends, on what timeline, and what happens if the registrant never clicks (suspension policy) — this must be documented honestly to users.
- [ ] **WHOIS privacy**: confirm it is available and free/cheap at the reseller tier, since the product promises it included.
- [ ] **Renewals/transfers**: confirm the API supports them for a future v2 (v1 is registration-only by design, but avoid a platform that would block v2).
- [ ] **Abuse/fraud expectations**: any KYC or fraud-screening obligations on the reseller.

## Decision rule

- Reseller onboarding complete **in writing** (account approval, agreement, or explicit program terms) + wholesale pricing confirms the margin → integrate behind `src/providers.js`, set `DOMAIN_AUTHORIZATION_REFERENCE`, proceed.
- Onboarding demands uneconomical deposits/minimums, or stays vague past ~5 business days → evaluate the next candidate (e.g. another reseller platform) before writing provider code.
- No candidate confirms → **do not launch**. A provider switch later is a contained `providers.js` change by design; registering domains without an approved reseller account risks the account and the customers' domains.

## Evidence

Record the outcome here: platform name, account/reference, date, exact terms language or agreement reference, and wholesale pricing figures with sources. This file is the project's paper trail.
