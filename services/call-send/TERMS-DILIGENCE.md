# TERMS-DILIGENCE.md — CallSend week-one checklist

**Rule: do not build the live Twilio integration, take live orders, or
spend money until every box below is checked.** This is the Lob lesson
applied to voice: a developer API key is not permission to run a paid,
customer-facing service on top of it.

## 1. Twilio terms — the gate

- [ ] Read Twilio's current Terms of Service + Acceptable Use Policy for
      language about reselling, white-labeling, or building
      customer-facing services on the API.
- [ ] Determine whether a **partner / reseller / white-label track**
      exists for Twilio Programmable Voice (ISV / partner program).
- [ ] Get **written** confirmation that ALL of the following are
      permitted:
  - Operating a paid service where end users pay CallSend (not Twilio).
  - Setting our own retail price ($0.99/call).
  - Submitting calls on behalf of third parties from our Twilio account.
  - Using our account's caller ID for third-party-originated calls.
- [ ] Ask whether a partner agreement, order form, minimum volume, or
      different pricing applies.
- [ ] Record the outcome in `CALL_AUTHORIZATION_REFERENCE` (a short
      reference like `twilio-partner-agreement-2026-09-21`). Live mode
      refuses to boot without it (`src/config.js`).

**Decision rule:** written partner-track confirmation → build the live
integration. Self-serve terms only → do NOT launch on Twilio; evaluate
alternatives (Telnyx Voice, Plivo) under the same rule.

## 2. Voice-compliance checklist (legal review required before live)

Placing automated calls is regulated (US: TCPA, state mini-TCPAs, FCC
rules). This scaffold implements best-effort technical controls; they are
**not** legal advice and do not replace counsel.

- [ ] **Consent model:** define exactly whose consent is required for each
      call type CallSend will support, and how the reviewer asserts it
      (the confirmation wording is a starting point, not a legal
      instrument).
- [ ] **Scope:** personal/transactional calls only (reminders,
      confirmations, follow-ups). Marketing/telemarketing is out of scope
      — document this in the real terms.
- [ ] **Disclosure:** every call starts with the automated-call
      disclosure (`src/compliance.js`). Confirm the wording satisfies
      identification requirements.
- [ ] **Time-of-day:** 08:00–21:00 recipient-local, best-effort via the
      NANP area-code table. Production needs a real numbering-plan / LRN
      lookup; the current table is documented as best-effort.
- [ ] **DNC:** decide whether a do-not-call suppression list is needed
      for the supported call types; implement if counsel says so.
- [ ] **Recording consent:** `record: true` creates a recording. Consent
      rules vary by state (one-party vs all-party). Decide the policy:
      default-off is already the default; consider geo-gating or
      explicit per-call consent language.
- [ ] **Caller ID:** STIR/SHAKEN attestation posture for the sending
      number; never spoof or misrepresent the calling identity.
- [ ] **Abuse:** rate limits (10 drafts/hour/IP), no bulk endpoint,
      24h duplicate-draft rejection, 500-call unpurged cap. Decide
      whether per-recipient cooldowns are needed.

## 3. Pricing verification

- [ ] Confirm Twilio's actual per-minute voice pricing for the account's
      region(s); verify $0.99/call covers a 5-minute call + Stripe fees
      with margin.
- [ ] Confirm the sending number's monthly cost and any verification
      (toll-free / 10DLC-style registration if applicable to voice).

## 4. Open-source adapter posture

- [ ] Confirm the provider permits an open-source adapter that calls
      CallSend's paid service (the adapter itself is free; the service
      behind it is paid).

---

*Resolved by: ______________ on: __________ — attach the written
provider confirmation before flipping `APP_MODE` past demo.*
