import assert from "node:assert/strict";
import { test } from "node:test";
import { listConnectors } from "@telep/registry";
import { LEGAL_DISCLAIMER, connectorLegal, getConnectorLegal } from "../lib/legal";

const EXPECTED_SLUGS = [
  "paper-send",
  "sumvid",
  "shipsignal",
  "sign-send",
  "fax-send",
  "call-send",
  "ink-send",
  "domain-send",
  "ship-label",
  "print-merch",
] as const;

test("every catalog connector has matching per-connector legal pages", () => {
  const connectors = listConnectors();
  assert.equal(connectors.length, EXPECTED_SLUGS.length);

  for (const connector of connectors) {
    assert.equal(connector.privacyPath, `/connectors/${connector.slug}/privacy`, connector.slug);
    assert.equal(connector.termsPath, `/connectors/${connector.slug}/terms`, connector.slug);
    assert.equal(connector.apiBasePath, `/v1/${connector.slug}`, connector.slug);
    assert.equal(connector.mcpPath, `/mcp/${connector.slug}`, connector.slug);
    assert.equal(connector.gatewayImplemented, true, connector.slug);

    const legal = getConnectorLegal(connector.slug);
    assert.ok(legal, `missing legal copy for ${connector.slug}`);
    assert.ok(legal.privacy.length >= 5, connector.slug);
    assert.ok(legal.terms.length >= 6, connector.slug);

    const blob = JSON.stringify(legal);
    assert.equal(blob.includes("Bearer <redacted>"), false, connector.slug);
    assert.match(blob, /Bearer API keys/);
    assert.match(blob, /independent of Meta/i);
    assert.equal(/approved by Meta/i.test(blob), false, connector.slug);
    assert.match(blob, /not a claim that Meta approved/);
    assert.match(blob, /stub/i);
  }

  assert.deepEqual(
    Object.keys(connectorLegal).sort(),
    [...EXPECTED_SLUGS].sort(),
  );
});

test("PaperSend legal uses catalog submitted status without claiming Meta approval", () => {
  const blob = JSON.stringify(connectorLegal["paper-send"]);
  assert.match(blob, /catalog status for PaperSend is “submitted”/);
  assert.match(blob, /not approved, featured, or partnered/);
  assert.match(blob, /status “stubbed”/);
  assert.equal(blob.includes("sumvid.app"), false);
});

test("CallSend / InkSend / DomainSend do not claim live fulfillment", () => {
  const call = JSON.stringify(connectorLegal["call-send"]);
  assert.match(call, /no calls are placed/i);
  assert.match(call, /SHAKEN\/STIR/);
  assert.match(call, /in progress/);
  assert.equal(/Calls originate from a 216/.test(call), false);
  assert.equal(call.includes("duration,"), false);

  const ink = JSON.stringify(connectorLegal["ink-send"]);
  assert.match(ink, /does not mail anything/i);
  assert.match(ink, /Planned live semantics/);
  assert.equal(ink.includes("sender address"), true);

  const domain = JSON.stringify(connectorLegal["domain-send"]);
  assert.match(domain, /does not collect registrant contact/i);
  assert.match(domain, /WHOIS privacy is planned/);
  assert.equal(/\bWHOIS privacy is included\b/.test(domain), false);
});

test("disclaimer is the public-page one-liner", () => {
  assert.match(LEGAL_DISCLAIMER, /not legal advice/i);
});

test("registry legal paths match the locked catalog URL map", () => {
  for (const connector of listConnectors()) {
    assert.equal(connector.privacyPath, `/connectors/${connector.slug}/privacy`);
    assert.equal(connector.termsPath, `/connectors/${connector.slug}/terms`);
    assert.match(connector.privacyPath, /^\/connectors\/[a-z0-9-]+\/privacy$/);
    assert.match(connector.termsPath, /^\/connectors\/[a-z0-9-]+\/terms$/);
  }
});
