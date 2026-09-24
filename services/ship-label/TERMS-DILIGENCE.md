# ShipLabel terms diligence

Checked 24 September 2026 by downloading the PDFs. Both links returned `application/pdf`.

## EasyPost Master Customer Agreement §3.2.2

Source: <https://easypost.pactsafe.io/versions/69d8060fc9e31eace8300ecd.pdf> (Master Customer Agreement 6.0, vid `69d8060fc9e31eace8300ecd`).

The API license grant says EasyPost grants a limited, non-exclusive, non-transferable, non-sublicensable, fully revocable right during the Order Form Term to (i) access the APIs and documentation to develop, test, and support the customer application and (ii) offer the EasyPost products and services to end users through the customer application.

That is an Order Form grant, not a self-serve Developer Plan grant.

## API Addendum, Developer Plan Pricing use restrictions

Source: <https://easypost.pactsafe.io/versions/6a3c4db312b30aca969dfd27.pdf> (API Addendum 4.1, vid `6a3c4db312b30aca969dfd27`).

The addendum states that EasyPost Developer Plan Pricing is available for businesses engaging in direct-to-consumer shipping and is not available as a white-label or resale feature. EasyPost may suspend accounts that use Developer Plan Pricing to white-label or resell the APIs.

Live ShipLabel must be enrolled through Forge (sales / Order Form). The service refuses `APP_MODE=live` without `EASYPOST_ORDER_FORM_REFERENCE`. Forge overview: <https://support.easypost.com/hc/en-us/articles/34176670288013-Introduction-to-Forge>.

## Carrier limits (same API addendum)

UPS DAP: the customer is not permitted to increase or mark up the rates provided by UPS for purposes of reselling labels to another entity or end user. A platform, reseller, or distributor is not permitted to enroll end users in UPS DAP without an agreement with UPS and UPS's written consent.

FedEx by Default: the customer may not under any circumstances sell, assign, or transfer the benefit of pricing to any other party.

`CARRIER_ALLOWLIST` is `USPS` in the gateway and in this service.

## Enrollment status

Forge signup is not complete. This tree does not claim live-readiness. Test mode may use an EasyPost test key. Live mode stays off until the Order Form reference is set in the host environment.
