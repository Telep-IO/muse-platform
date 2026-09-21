# Terms diligence — do this in week one, before any live build

**Rule: do not build live provider integration, take test/live payments, or submit a connector application until the item below is confirmed in writing.**

## The question

Which e-signature API provider permits a **paid, customer-facing third-party service** built on their API — i.e., Jon's customers pay Jon, Jon's backend calls the provider, signers never see the provider's brand? Self-serve developer terms alone are not sufficient: every major provider's standard agreement restricts resale/sublicensing to internal business use (this is exactly the Lob lesson from Paper Send).

## Candidates

1. **Dropbox Sign (formerly HelloSign)** — check their API terms for resale/white-label language and any partner program.
2. **DocuSign** — check the API terms of service and whether a partner/ISV track covers this model.

## What to look for (in order of preference)

- [ ] An explicit **white-label, partner, ISV, or reseller program** page naming this model.
- [ ] Terms section on **API use / restrictions / sublicensing** — quote the exact section numbers and language.
- [ ] Whether the partner track requires an **application, revenue share, or volume commitment**.
- [ ] **Signer-facing branding**: can notification emails and signing pages be white-labeled, or must they carry the provider's brand?
- [ ] **Per-envelope API pricing** at low volume — verify $2.99 retail leaves a maintainable margin after provider + Stripe (~$0.45) costs.
- [ ] **Content/legal restrictions**: any document types the provider refuses to process.

## Decision rule

- Provider confirms the model **in writing** (partner agreement, authorization email, or explicit program terms) → integrate behind `src/providers.js`, set `ESIGN_AUTHORIZATION_REFERENCE`, proceed.
- Provider says no, demands uneconomical enterprise terms, or stays vague past ~5 business days → move to the next candidate.
- No candidate confirms → **do not launch**. A provider switch later is a contained `providers.js` change by design; launching without permission risks account suspension mid-stream.

## Evidence

Record the outcome here: provider name, contact/reference, date, exact terms language or agreement reference, and pricing figures with sources. This file is the project's paper trail.
