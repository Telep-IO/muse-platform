# PaperSend: remaining launch decisions

The code changes reduce particular operational risks. They do not establish legal compliance, obtain provider permission, or substitute for a review of the actual operator, state/country, customer locations, and vendor agreements. No external messages or applications have been sent.

## Lob authorization

The [service-specific terms](https://www.lob.com/service-specific-terms) checked September 19, 2026 contain restrictions on incorporating the API into third-party offerings (4.3(I)), exposing address-verification results (3.3), and require appropriate end-user authorizations/terms (4.4). The [general terms](https://www.lob.com/terms) and [AUP](https://www.lob.com/aup) allocate responsibilities to the account holder. Confirm which signed order form or negotiated terms apply to this account rather than assuming the public website is the entire agreement.

PaperSend no longer returns provider-derived standardized addresses or reports; it uses verification internally and displays the customer's supplied addresses. This change does not, by itself, establish permission for the overall paid service. Obtain written confirmation covering the actual design and save the agreement securely. Put its reference in `LOB_AUTHORIZATION_REFERENCE` only after it exists. Live startup checks that a reference is configured; it cannot authenticate or interpret that agreement.

### Prepared request to Lob (not sent)

Subject: Written authorization for PaperSend customer-facing Print & Mail integration

We are building PaperSend, a paid service for individual US letters. Customers or authorized agents upload a PDF and sender/recipient addresses. We use US Address Verification internally before payment, do not return its standardized data or report to customers, and show the customer's supplied addresses for approval. After customer confirmation and successful Stripe payment, our backend uses our private Lob account credentials to submit the PDF and addresses for Print & Mail fulfillment. End users never receive Lob credentials or direct API access. We charge our own per-order retail price.

Please confirm in writing that our account/agreement permits this customer-facing workflow and pricing model, including the internal address check and resulting printed postal formatting. Please identify any partner/reseller agreement, API authorization, required customer terms, data-processing terms, NCOA requirements, content restrictions, or other obligations we must complete before launch. In particular, please clarify applicability of service-specific sections 3.3, 4.3(I), and 4.4 to this design.

## Operator and legal documents

- Supply the actual legal operator name, business contact address, and monitored support/privacy email in `.env`; live mode requires these. Do not invent an LLC, address, jurisdiction, or support channel.
- The updated terms explain customer authorization, AI-content review, automatic fulfillment, provider access, limitations of ordinary mail, refunds, prohibited use, support, prospective changes, and drafted liability/indemnity terms.
- Have counsel review the $100/order-fee liability provision, business-only indemnity, age restriction, applicable privacy rights/notices, and any state-specific changes. No arbitration clause or chosen jurisdiction was invented. The proposed 180-day approval-record period is a product retention choice, not a claim about a statutory limitation period; assess whether it suits actual dispute/accounting obligations.
- The privacy notice distinguishes prepayment address verification, post-payment document fulfillment, private-link exposure, integrations, internal/provider access, retention exceptions, and backups. Do not claim documents are inaccessible to staff or that provider/backup copies vanish when the app purges them.
- Confirm hosting/backups/access practices match the notice, implement deletion/access request handling with authority verification, and keep incident-response and abuse contacts monitored. The notice provides a contact process; it does not mean an automated privacy-rights portal exists.

## Payments and verification

- Configure Stripe's business Terms URL and receipt settings. Checkout requires `consent_collection.terms_of_service=required` and links the version-specific terms in its submit message. Verify this with the actual account; provider mocks do not prove dashboard configuration or account permissions.
- The app records the approval fingerprint in Stripe metadata and checks it with signed payment events. Price, currency, tax and mode must match. The current hosted Checkout UX still needs real test-account verification, including refunds and terms acceptance.
- Run a permitted physical sample order before customer sales and verify content, address layout, postage, and handling of failures.
- Set up HTTPS, persistent storage, encrypted backups, and monitoring for `needs_review`, failing print checks, and stalled refunds. Investigate such cases against both providers before taking action; do not blindly resend or assume a refund cancels a physical letter.

## Approval evidence and privacy operations

`pnpm ops evidence ORDER_UUID` prints the retained approval record and payment references. Access it only for an authorized support/dispute purpose. It includes document and address fingerprints, price/tax configuration, print settings, exact approval wording, policy hashes and timestamp, plus payment references/totals when received. Actual addresses remain only in the order row until its normal purge; document data remains only until its normal purge. No extra IP-address tracking was introduced for consent evidence.

Fingerprints are integrity checks, not anonymization, proof of identity, or notarization. Database triggers prevent ordinary UPDATE operations on evidence but a privileged database administrator could change the database. Protect backups and admin access. Old records without evidence are not retroactively represented as approved.

The native Muse adapter and Meta directory review remain separate, unfinished work. Do not advertise approval or a live native connector until actually verified and approved.
