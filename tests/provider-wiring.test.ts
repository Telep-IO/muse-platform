import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { checkPaper, createJob, quotePaper, resetJobs } from "@telep/paper-send";
import { checkGiftSend, quoteCents as giftQuoteCents } from "@telep/gift-send";
import { checkShipLabel, quoteCents } from "@telep/ship-label";
import { checkSumvid, resetSummaries, summarize } from "@telep/sumvid";
import { checkShip, resetParcels, trackParcel } from "@telep/shipsignal";
import { checkSign } from "@telep/sign-send";
import { checkFax } from "@telep/fax-send";
import { checkCall } from "@telep/call-send";
import { checkInk } from "@telep/ink-send";
import { checkDomainCredentials, openSrsSignature, parseOpenSrsLookup, resolveAvailability } from "@telep/domain-send";
import { HttpError } from "@telep/platform";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetJobs();
  resetSummaries();
  resetParcels();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("demo credential checks do not call fetch", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({});
  };
  const paper = await checkPaper({});
  const sumvid = await checkSumvid({});
  const ship = await checkShip({});
  const sign = await checkSign({});
  const fax = await checkFax({});
  const call = await checkCall({});
  const ink = await checkInk({});
  const domain = await checkDomainCredentials({});
  const shipLabel = await checkShipLabel({});
  const giftSend = await checkGiftSend({});
  assert.equal(called, false);
  assert.equal(giftSend.mode, "demo");
  assert.equal(giftSend.tremendous, "skipped");
  assert.equal(giftQuoteCents(5000, 299), 5299);
  assert.equal(shipLabel.mode, "demo");
  assert.equal(shipLabel.easypost, "skipped");
  assert.equal(quoteCents(737, 199), 936);
  assert.equal(paper.mode, "demo");
  assert.equal(paper.spend, "none");
  assert.equal(sumvid.fulfillment, "stub");
  assert.equal(ship.fulfillment, "stub");
  assert.equal(sign.spend, "none");
  assert.equal(fax.spend, "none");
  assert.equal(call.spend, "none");
  assert.equal(ink.spend, "none");
  assert.equal(domain.spend, "none");
  assert.equal(quotePaper(2).amountCents, 524);
});

test("test mode without keys is a clear error and does not call fetch", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({});
  };
  await assert.rejects(() => checkGiftSend({ GIFT_SEND_APP_MODE: "test" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  await assert.rejects(
    () => checkGiftSend({ GIFT_SEND_APP_MODE: "live", GIFT_SEND_API_KEY: "present" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "missing_credentials");
      return true;
    },
  );
  await assert.rejects(() => checkShipLabel({ SHIP_LABEL_APP_MODE: "test" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  await assert.rejects(() => checkShipLabel({ SHIP_LABEL_APP_MODE: "live" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  await assert.rejects(() => checkPaper({ PAPER_SEND_APP_MODE: "test" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  await assert.rejects(() => checkSumvid({ SUMVID_APP_MODE: "live", SUMVID_API_BASE_URL: "https://sumvid.example" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  assert.equal(called, false);
});

test("paper check verifies Lob with a read-only address list and refuses a live key in test mode", async () => {
  await assert.rejects(
    () => checkPaper({ PAPER_SEND_APP_MODE: "test", PAPER_SEND_LOB_API_KEY: "live_secret" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_credentials");
      return true;
    },
  );

  let url = "";
  let auth = "";
  globalThis.fetch = async (input, init) => {
    url = String(input);
    auth = String(new Headers(init?.headers).get("authorization"));
    return jsonResponse({ data: [] });
  };
  const result = await checkPaper({ PAPER_SEND_APP_MODE: "test", PAPER_SEND_LOB_API_KEY: "test_example" });
  assert.equal(result.lob, "ok");
  assert.equal(result.mailed, false);
  assert.equal(result.stripe, "not_set");
  assert.ok(url.includes("https://api.lob.com/v1/addresses"));
  assert.ok(auth.startsWith("Basic "));
  assert.equal(auth.includes("test_example"), false);

  const job = createJob({
    sender: { name: "A", address_line1: "1", address_city: "C", address_state: "OH", address_zip: "44113" },
    recipient: { name: "B", address_line1: "2", address_city: "C", address_state: "OH", address_zip: "44114" },
    ownerKeyId: "k",
    catalogOrigin: "http://localhost:3000",
    live: true,
  });
  assert.equal(job.status, "draft");
  assert.equal(job.fulfillment, "live");
  assert.equal(job.note.includes("hashed"), false);
  assert.equal(job.note.includes("not asked to print"), true);
});

test("sumvid summarize uses the API and surfaces insufficient credits", async () => {
  globalThis.fetch = async () =>
    jsonResponse({ title: "Real title", summary: "Real summary from captions.", bullets: ["One"] }, 201);
  const summary = await summarize(
    { youtubeUrl: "dQw4w9WgXcQ", ownerKeyId: "k" },
    { SUMVID_APP_MODE: "test", SUMVID_API_BASE_URL: "https://sumvid.example", SUMVID_API_KEY: "secret" },
  );
  assert.equal(summary.status, "ready");
  assert.equal(summary.fulfillment, "live");
  assert.equal(summary.summary, "Real summary from captions.");
  assert.equal(summary.note.includes("Gateway stub"), false);

  globalThis.fetch = async () =>
    jsonResponse({ error: { code: "insufficient_credits", message: "Add credits", topUpUrl: "https://sumvid.example/topup" } }, 402);
  await assert.rejects(
    () => summarize(
      { youtubeUrl: "dQw4w9WgXcQ", ownerKeyId: "k" },
      { SUMVID_APP_MODE: "test", SUMVID_API_BASE_URL: "https://sumvid.example/", SUMVID_API_KEY: "secret" },
    ),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 402);
      assert.equal(error.code, "insufficient_credits");
      assert.equal(error.extras?.topUpUrl, "https://sumvid.example/topup");
      return true;
    },
  );
});

test("shipsignal shippo lookup is read-only and drops the stub note", async () => {
  let method = "";
  globalThis.fetch = async (_input, init) => {
    method = init?.method ?? "GET";
    return jsonResponse({
      carrier: "ups",
      tracking_status: { status: "TRANSIT", status_details: "In transit" },
      tracking_history: [{ status: "TRANSIT", status_details: "Departed facility", status_date: "2026-09-01T00:00:00Z", location: { city: "Cleveland", state: "OH" } }],
    });
  };
  const parcel = await trackParcel(
    { trackingNumber: "1Z999AA10123456784", ownerKeyId: "k" },
    { SHIPSIGNAL_APP_MODE: "test", SHIPSIGNAL_PROVIDER: "shippo", SHIPSIGNAL_API_KEY: "shippo_test" },
  );
  assert.equal(method, "GET");
  assert.equal(parcel.status, "tracked");
  assert.equal(parcel.fulfillment, "live");
  assert.equal(parcel.note.includes("Gateway stub"), false);
  assert.equal(parcel.events[0].location, "Cleveland, OH");
});

test("call, fax, sign, and ink checks hit auth endpoints only", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return jsonResponse({ status: "active" });
  };
  const call = await checkCall({
    CALL_SEND_APP_MODE: "test",
    CALL_SEND_TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
    CALL_SEND_TWILIO_AUTH_TOKEN: "token",
  });
  assert.equal(call.spend, "none");
  assert.ok(urls[0].includes("api.twilio.com/2010-04-01/Accounts/"));

  await checkFax({
    FAX_SEND_APP_MODE: "test",
    FAX_SEND_FAX_PROVIDER: "phaxio",
    FAX_SEND_FAX_API_KEY: "key",
    FAX_SEND_FAX_API_SECRET: "secret",
  });
  assert.ok(urls[1].includes("api.phaxio.com/v2.1/account/status"));

  await checkSign({
    SIGN_SEND_APP_MODE: "test",
    SIGN_SEND_ESIGN_PROVIDER: "hellosign",
    SIGN_SEND_ESIGN_API_KEY: "hs_key",
  });
  assert.ok(urls[2].includes("api.hellosign.com/v3/account"));

  await checkInk({ INK_SEND_APP_MODE: "test", INK_SEND_INK_PROVIDER: "handwrytten", INK_SEND_INK_API_KEY: "ink" });
  assert.ok(urls[3].includes("api.handwrytten.com/v2/auth/getUser"));
});

test("domain lookup parses OpenSRS XML and does not register", async () => {
  const xml = `<?xml version='1.0' encoding='UTF-8' standalone='no'?>
<OPS_envelope><body><data_block><dt_assoc>
<item key="protocol">XCP</item>
<item key="action">REPLY</item>
<item key="response_code">200</item>
<item key="response_text">Command successful</item>
<item key="attributes"><dt_assoc><item key="status">available</item></dt_assoc></item>
</dt_assoc></data_block></body></OPS_envelope>`;
  assert.equal(parseOpenSrsLookup(xml).status, "available");
  const signature = openSrsSignature("<xml/>", "key");
  assert.equal(signature.length, 32);

  let method = "";
  globalThis.fetch = async (_input, init) => {
    method = init?.method ?? "GET";
    assert.equal(String(init?.body).includes("LOOKUP"), true);
    assert.equal(String(init?.body).includes("SW_REGISTER"), false);
    return new Response(xml, { status: 200 });
  };
  const result = await resolveAvailability("studio-telep.com", {
    DOMAIN_SEND_APP_MODE: "test",
    DOMAIN_SEND_RESELLER_API_KEY: "reseller-key",
    DOMAIN_SEND_RESELLER_USERNAME: "telep",
  });
  assert.equal(method, "POST");
  assert.equal(result.available, true);
  assert.equal(result.source, "opensrs");
  assert.equal(result.spend, "none");

  const demo = await resolveAvailability("taken-studio.com", {});
  assert.equal(demo.available, false);
  assert.equal(demo.source, "stub");
});
