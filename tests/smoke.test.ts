import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getConnector, listConnectors } from "@telep/registry";
import { authenticate, isApiHost, KEY_PATTERN, lookupKey } from "@telep/platform";
import { handlePaperSendMcp, handlePaperSendRest, resetJobs } from "@telep/paper-send";
import { handleSignSendMcp, handleSignSendRest, resetEnvelopes } from "@telep/sign-send";
import { handleFaxSendMcp, handleFaxSendRest, resetFaxes } from "@telep/fax-send";
import { handleCallSendMcp, handleCallSendRest, resetCalls } from "@telep/call-send";
import { handleInkSendMcp, handleInkSendRest, resetLetters } from "@telep/ink-send";
import { handleDomainSendMcp, handleDomainSendRest, resetDomains } from "@telep/domain-send";
import { handleSumvidMcp, handleSumvidRest, resetSummaries, STUB_NOTE as SUMVID_STUB } from "@telep/sumvid";
import {
  handleShipSignalMcp,
  handleShipSignalRest,
  resetParcels,
  STUB_NOTE as SHIP_STUB,
} from "@telep/shipsignal";
import { dispatchMcp, dispatchRest, healthPayload, platformOpenApi, v1Index } from "../lib/gateway";

const DEMO = "muse_sk_demo_localdev";

before(() => {
  process.env.MUSE_API_KEYS = DEMO;
  process.env.NEXT_PUBLIC_CATALOG_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
});

after(() => {
  resetJobs();
  resetEnvelopes();
  resetFaxes();
  resetCalls();
  resetLetters();
  resetDomains();
  resetSummaries();
  resetParcels();
});

test("registry loads paper-send as submitted", () => {
  const connectors = listConnectors();
  assert.ok(connectors.length >= 8);
  const paper = getConnector("paper-send");
  assert.equal(paper?.status, "submitted");
  assert.equal(paper?.apiBasePath, "/v1/paper-send");
  assert.equal(paper?.mcpPath, "/mcp/paper-send");
  assert.ok(connectors.every((c) => c.slug !== "barkmarks" && c.slug !== "callcatch"));
});

test("catalog list includes paper-send for homepage grid", () => {
  const slugs = listConnectors().map((c) => c.slug);
  assert.ok(slugs.includes("paper-send"));
  assert.ok(slugs.includes("sumvid"));
  assert.ok(slugs.includes("shipsignal"));
});

test("health payload", () => {
  const health = healthPayload();
  assert.equal(health.ok, true);
  assert.equal(health.service, "muse-platform");
  assert.equal(health.connectors, listConnectors().length);
});

test("v1 index lists implemented gateway modules", () => {
  const index = v1Index();
  const implemented = [
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
  ];
  for (const slug of implemented) {
    const connector = index.connectors.find((c) => c.slug === slug);
    assert.ok(connector, slug);
    assert.equal(connector?.gatewayImplemented, true, slug);
  }
  const sumvid = index.connectors.find((c) => c.slug === "sumvid");
  assert.equal(sumvid?.status, "ready");
  assert.equal(sumvid?.apiBasePath, "/v1/sumvid");
  assert.equal(sumvid?.mcpPath, "/mcp/sumvid");
  const shipsignal = index.connectors.find((c) => c.slug === "shipsignal");
  assert.equal(shipsignal?.status, "ready");
  assert.equal(shipsignal?.apiBasePath, "/v1/shipsignal");
  assert.equal(shipsignal?.mcpPath, "/mcp/shipsignal");
});

test("merged OpenAPI includes sumvid, shipsignal, and *-send paths", () => {
  const spec = platformOpenApi();
  assert.ok(spec.paths["/v1/sumvid/summaries"]);
  assert.ok(spec.paths["/v1/shipsignal/parcels"]);
  assert.ok(spec.paths["/v1/paper-send/jobs"]);
  assert.ok(spec.paths["/v1/ship-label/shipments"]);
  assert.ok(spec.paths["/v1/sign-send/envelopes"]);
  assert.ok(spec.paths["/v1/fax-send/faxes"]);
  assert.ok(spec.paths["/v1/call-send/calls"]);
  assert.ok(spec.paths["/v1/ink-send/letters"]);
  assert.ok(spec.paths["/v1/domain-send/domains"]);
  assert.ok(spec.paths["/v1/print-merch/merch_orders"]);
});

test("API key format and lookup", () => {
  assert.ok(KEY_PATTERN.test(DEMO));
  assert.equal(lookupKey(DEMO)?.env, "demo");
  assert.equal(lookupKey("nope"), null);
});

test("write routes reject missing bearer key", () => {
  const request = new Request("http://localhost/v1/paper-send/jobs", { method: "POST" });
  assert.throws(() => authenticate(request, { required: true }), /Bearer/);
});

test("paper-send authenticated create / get / list", async () => {
  resetJobs();
  const headers = {
    Authorization: `Bearer ${DEMO}`,
    "Content-Type": "application/json",
  };
  const created = await handlePaperSendRest(
    new Request("http://localhost/v1/paper-send/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sender: {
          name: "Ada",
          address_line1: "1 Main",
          address_city: "Cleveland",
          address_state: "OH",
          address_zip: "44113",
        },
        recipient: {
          name: "Bob",
          address_line1: "2 Main",
          address_city: "Cleveland",
          address_state: "OH",
          address_zip: "44114",
        },
        document: { filename: "letter.pdf", pages: 2 },
      }),
    }),
    ["jobs"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const job = (await created.json()) as { id: string; amountCents: number; status: string };
  assert.equal(job.amountCents, 524);
  assert.equal(job.status, "stubbed");

  const unauth = await handlePaperSendRest(
    new Request("http://localhost/v1/paper-send/jobs", { method: "POST", body: "{}" }),
    ["jobs"],
    null,
  );
  assert.equal(unauth.status, 401);

  const got = await handlePaperSendRest(
    new Request(`http://localhost/v1/paper-send/jobs/${job.id}`),
    ["jobs", job.id],
    lookupKey(DEMO),
  );
  assert.equal(got.status, 200);

  const listed = await handlePaperSendRest(
    new Request("http://localhost/v1/paper-send/jobs"),
    ["jobs"],
    lookupKey(DEMO),
  );
  const listJson = (await listed.json()) as { jobs: unknown[] };
  assert.equal(listJson.jobs.length, 1);
});

test("paper-send MCP tools/list and tools/call", async () => {
  const listed = await handlePaperSendMcp(
    new Request("http://localhost/mcp/paper-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const listJson = (await listed.json()) as { result: { tools: { name: string }[] } };
  const names = listJson.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["check_credentials", "create_mail_job", "get_job", "list_jobs"].sort());

  const called = await handlePaperSendMcp(
    new Request("http://localhost/mcp/paper-send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEMO}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "create_mail_job",
          arguments: {
            sender: {
              name: "Ada",
              address_line1: "1 Main",
              address_city: "Cleveland",
              address_state: "OH",
              address_zip: "44113",
            },
            recipient: {
              name: "Bob",
              address_line1: "2 Main",
              address_city: "Cleveland",
              address_state: "OH",
              address_zip: "44114",
            },
          },
        },
      }),
    }),
  );
  assert.equal(called.status, 200);
  const callJson = (await called.json()) as { result: { content: { text: string }[] } };
  assert.ok(callJson.result.content[0].text.includes("ps_"));
});

test("host detection treats api. as gateway-first", () => {
  assert.equal(isApiHost("api.muse.telep.io"), true);
  assert.equal(isApiHost("muse.telep.io"), false);
  assert.equal(isApiHost("localhost:3000"), false);
});

test("sign-send descriptor, registry, and OpenAPI wiring", async () => {
  const conn = getConnector("sign-send");
  assert.equal(conn?.apiBasePath, "/v1/sign-send");
  assert.equal(conn?.mcpPath, "/mcp/sign-send");
  assert.equal(conn?.gatewayImplemented, true);

  const desc = await handleSignSendRest(
    new Request("http://localhost/v1/sign-send"),
    [],
    lookupKey(DEMO),
  );
  assert.equal(desc.status, 200);
  const descJson = (await desc.json()) as { slug: string; fulfillment: string };
  assert.equal(descJson.slug, "sign-send");
  assert.equal(descJson.fulfillment, "stub");

  const spec = await handleSignSendRest(
    new Request("http://localhost/v1/sign-send/openapi.json"),
    ["openapi.json"],
    lookupKey(DEMO),
  );
  assert.equal(spec.status, 200);
  const specJson = (await spec.json()) as { paths: Record<string, unknown> };
  assert.ok(specJson.paths["/v1/sign-send/envelopes"]);
});

test("sign-send envelope lifecycle: draft -> paid -> sent -> signed", async () => {
  resetEnvelopes();
  const headers = {
    Authorization: `Bearer ${DEMO}`,
    "Content-Type": "application/json",
  };
  const created = await handleSignSendRest(
    new Request("http://localhost/v1/sign-send/envelopes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        document: { filename: "contract.pdf", pages: 3 },
        signers: [
          { name: "Alex", email: "alex@example.com" },
          { name: "Blake", email: "blake@example.com" },
        ],
      }),
    }),
    ["envelopes"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const env = (await created.json()) as {
    id: string;
    status: string;
    amountCents: number;
    signers: { order: number }[];
    reviewUrl: string;
  };
  assert.equal(env.amountCents, 299);
  assert.equal(env.status, "draft");
  assert.deepEqual(env.signers.map((s) => s.order), [1, 2]);
  assert.ok(env.reviewUrl.includes("/connectors/sign-send#review-"));

  for (const [event, body, want] of [
    ["paid", {}, "paid"],
    ["sent", {}, "sent"],
    ["signed", { signerEmail: "alex@example.com" }, "sent"],
    ["signed", { signerEmail: "blake@example.com" }, "signed"],
  ] as const) {
    const res = await handleSignSendRest(
      new Request(`http://localhost/v1/sign-send/envelopes/${env.id}/demo-event`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event, ...body }),
      }),
      ["envelopes", env.id, "demo-event"],
      lookupKey(DEMO),
    );
    assert.equal(res.status, 200);
    const updated = (await res.json()) as { status: string };
    assert.equal(updated.status, want);
  }

  const unauth = await handleSignSendRest(
    new Request("http://localhost/v1/sign-send/envelopes", { method: "POST", body: "{}" }),
    ["envelopes"],
    null,
  );
  assert.equal(unauth.status, 401);
});

test("sign-send validation rejects bad envelopes", async () => {
  resetEnvelopes();
  const headers = {
    Authorization: `Bearer ${DEMO}`,
    "Content-Type": "application/json",
  };
  for (const body of [
    { signers: [] },
    { signers: [{ name: "No Email" }] },
    { signers: [{ name: "A", email: "a@x.com" }, { name: "B", email: "a@x.com" }] },
    { signers: Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, email: `s${i}@x.com` })) },
  ]) {
    const res = await handleSignSendRest(
      new Request("http://localhost/v1/sign-send/envelopes", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      ["envelopes"],
      lookupKey(DEMO),
    );
    assert.equal(res.status, 400);
  }
});

test("sign-send MCP tools/list and tools/call", async () => {
  const listed = await handleSignSendMcp(
    new Request("http://localhost/mcp/sign-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const listJson = (await listed.json()) as { result: { tools: { name: string }[] } };
  const names = listJson.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["check_credentials", "create_envelope", "get_envelope", "list_envelopes"].sort());

  const called = await handleSignSendMcp(
    new Request("http://localhost/mcp/sign-send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEMO}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "create_envelope",
          arguments: {
            signers: [{ name: "Alex", email: "alex@example.com" }],
            document: { filename: "nda.pdf", pages: 2 },
          },
        },
      }),
    }),
  );
  const callJson = (await called.json()) as { result: unknown; error?: { message: string } };
  assert.ok(!callJson.error, callJson.error?.message);
  assert.ok(callJson.result);
});

test("fax-send lifecycle: draft -> paid -> sending -> delivered", async () => {
  resetFaxes();
  const headers = { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" };
  const created = await handleFaxSendRest(
    new Request("http://localhost/v1/fax-send/faxes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: "+12165550100",
        document: { filename: "records.pdf", pages: 2 },
        coverPage: true,
      }),
    }),
    ["faxes"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const fax = (await created.json()) as { id: string; status: string; amountCents: number };
  assert.equal(fax.amountCents, 297); // 2 pages + billable cover
  assert.equal(fax.status, "draft");

  for (const [event, want] of [["paid", "paid"], ["sending", "sending"], ["delivered", "delivered"]] as const) {
    const res = await handleFaxSendRest(
      new Request(`http://localhost/v1/fax-send/faxes/${fax.id}/demo-event`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event }),
      }),
      ["faxes", fax.id, "demo-event"],
      lookupKey(DEMO),
    );
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, want);
  }

  const bad = await handleFaxSendRest(
    new Request("http://localhost/v1/fax-send/faxes", {
      method: "POST",
      headers,
      body: JSON.stringify({ to: "555-0100", document: { pages: 1 } }),
    }),
    ["faxes"],
    lookupKey(DEMO),
  );
  assert.equal(bad.status, 400);

  const tools = await handleFaxSendMcp(
    new Request("http://localhost/mcp/fax-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const names = ((await tools.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["check_credentials", "create_fax", "get_fax", "list_faxes"].sort());
});

test("call-send lifecycle: draft -> paid -> queued -> completed", async () => {
  resetCalls();
  const headers = { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" };
  const created = await handleCallSendRest(
    new Request("http://localhost/v1/call-send/calls", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: "+12165550100",
        script: "Hello, this is a test call. Please confirm your hours.",
      }),
    }),
    ["calls"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const call = (await created.json()) as { id: string; status: string; amountCents: number; voice: string };
  assert.equal(call.amountCents, 99);
  assert.equal(call.voice, "alloy");

  for (const [event, want] of [["paid", "paid"], ["queued", "queued"], ["answered", "queued"], ["completed", "completed"]] as const) {
    const res = await handleCallSendRest(
      new Request(`http://localhost/v1/call-send/calls/${call.id}/demo-event`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event }),
      }),
      ["calls", call.id, "demo-event"],
      lookupKey(DEMO),
    );
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, want);
  }

  const empty = await handleCallSendRest(
    new Request("http://localhost/v1/call-send/calls", {
      method: "POST",
      headers,
      body: JSON.stringify({ to: "+12165550100", script: "   " }),
    }),
    ["calls"],
    lookupKey(DEMO),
  );
  assert.equal(empty.status, 400);

  const tools = await handleCallSendMcp(
    new Request("http://localhost/mcp/call-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const names = ((await tools.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["check_credentials", "create_call", "get_call", "list_calls"].sort());
});

test("ink-send lifecycle: draft -> paid -> sent", async () => {
  resetLetters();
  const headers = { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" };
  const created = await handleInkSendRest(
    new Request("http://localhost/v1/ink-send/letters", {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: "Thank you for everything.",
        to: { name: "Aunt May", address_line1: "1 Main St", address_city: "Cleveland", address_state: "OH", address_zip: "44113" },
        card: "thank-you",
      }),
    }),
    ["letters"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const letter = (await created.json()) as { id: string; status: string; amountCents: number; card: string; note: string };
  assert.equal(letter.amountCents, 399);
  assert.equal(letter.card, "thank-you");
  assert.ok(letter.note.includes("accepted for mailing"));

  for (const [event, want] of [["paid", "paid"], ["sent", "sent"]] as const) {
    const res = await handleInkSendRest(
      new Request(`http://localhost/v1/ink-send/letters/${letter.id}/demo-event`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event }),
      }),
      ["letters", letter.id, "demo-event"],
      lookupKey(DEMO),
    );
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, want);
  }

  const tools = await handleInkSendMcp(
    new Request("http://localhost/mcp/ink-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const names = ((await tools.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["check_credentials", "create_letter", "get_letter", "list_letters"].sort());
});

test("domain-send check + registration lifecycle", async () => {
  resetDomains();
  const headers = { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" };

  const check = await handleDomainSendRest(
    new Request("http://localhost/v1/domain-send/domains/check", {
      method: "POST",
      headers,
      body: JSON.stringify({ domain: "studio-telep.com" }),
    }),
    ["domains", "check"],
    lookupKey(DEMO),
  );
  assert.equal(check.status, 200);
  const checkJson = (await check.json()) as { available: boolean; priceCents: number };
  assert.equal(checkJson.available, true);
  assert.equal(checkJson.priceCents, 1499);

  const taken = await handleDomainSendRest(
    new Request("http://localhost/v1/domain-send/domains/check", {
      method: "POST",
      headers,
      body: JSON.stringify({ domain: "taken-example.com" }),
    }),
    ["domains", "check"],
    lookupKey(DEMO),
  );
  assert.equal(((await taken.json()) as { available: boolean }).available, false);

  const created = await handleDomainSendRest(
    new Request("http://localhost/v1/domain-send/domains", {
      method: "POST",
      headers,
      body: JSON.stringify({ domain: "Studio-Telep.com", years: 2 }),
    }),
    ["domains"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const domain = (await created.json()) as { id: string; domain: string; amountCents: number; whoisPrivacy: boolean };
  assert.equal(domain.domain, "studio-telep.com");
  assert.equal(domain.amountCents, 2998);
  assert.equal(domain.whoisPrivacy, true);

  for (const [event, want] of [["paid", "paid"], ["active", "active"]] as const) {
    const res = await handleDomainSendRest(
      new Request(`http://localhost/v1/domain-send/domains/${domain.id}/demo-event`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event }),
      }),
      ["domains", domain.id, "demo-event"],
      lookupKey(DEMO),
    );
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, want);
  }

  const tools = await handleDomainSendMcp(
    new Request("http://localhost/mcp/domain-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const names = ((await tools.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["check_credentials", "check_domain", "get_domain", "list_domains", "register_domain"].sort());
});

const authHeaders = {
  Authorization: `Bearer ${DEMO}`,
  "Content-Type": "application/json",
};

test("sumvid authenticated create / get / list / account", async () => {
  resetSummaries();
  const created = await handleSumvidRest(
    new Request("http://localhost/v1/sumvid/summaries", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    }),
    ["summaries"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const summary = (await created.json()) as {
    id: string;
    status: string;
    videoId: string;
    note: string;
    fulfillment: string;
  };
  assert.equal(summary.status, "stubbed");
  assert.equal(summary.videoId, "dQw4w9WgXcQ");
  assert.equal(summary.fulfillment, "stub");
  assert.equal(summary.note, SUMVID_STUB);
  assert.ok(summary.id.startsWith("sv_"));

  const unauth = await handleSumvidRest(
    new Request("http://localhost/v1/sumvid/summaries", { method: "POST", body: "{}" }),
    ["summaries"],
    null,
  );
  assert.equal(unauth.status, 401);

  const badUrl = await handleSumvidRest(
    new Request("http://localhost/v1/sumvid/summaries", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ youtubeUrl: "https://example.com/watch?v=nope" }),
    }),
    ["summaries"],
    lookupKey(DEMO),
  );
  assert.equal(badUrl.status, 400);

  const got = await handleSumvidRest(
    new Request(`http://localhost/v1/sumvid/summaries/${summary.id}`),
    ["summaries", summary.id],
    lookupKey(DEMO),
  );
  assert.equal(got.status, 200);

  const listed = await handleSumvidRest(
    new Request("http://localhost/v1/sumvid/summaries"),
    ["summaries"],
    lookupKey(DEMO),
  );
  const listJson = (await listed.json()) as { summaries: unknown[] };
  assert.equal(listJson.summaries.length, 1);

  const account = await handleSumvidRest(
    new Request("http://localhost/v1/sumvid/account"),
    ["account"],
    lookupKey(DEMO),
  );
  const accountJson = (await account.json()) as { summariesCreated: number; plan: string };
  assert.equal(accountJson.summariesCreated, 1);
  assert.equal(accountJson.plan, "stub");
});

test("sumvid MCP initialize, tools/list, and tools/call", async () => {
  resetSummaries();
  const initialized = await handleSumvidMcp(
    new Request("http://localhost/mcp/sumvid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
    }),
  );
  const initJson = (await initialized.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(initJson.result.serverInfo.name, "sumvid");

  const listed = await handleSumvidMcp(
    new Request("http://localhost/mcp/sumvid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const listJson = (await listed.json()) as { result: { tools: { name: string }[] } };
  const names = listJson.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["check_credentials", "get_account", "get_summary", "summarize_youtube"]);

  const called = await handleSumvidMcp(
    new Request("http://localhost/mcp/sumvid", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "summarize_youtube",
          arguments: { youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" },
        },
      }),
    }),
  );
  assert.equal(called.status, 200);
  const callJson = (await called.json()) as { result: { content: { text: string }[] } };
  assert.ok(callJson.result.content[0].text.includes("sv_"));
  assert.ok(callJson.result.content[0].text.includes("Gateway stub"));
});

test("shipsignal authenticated track / list / refresh / watch", async () => {
  resetParcels();
  const created = await handleShipSignalRest(
    new Request("http://localhost/v1/shipsignal/parcels", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ trackingNumber: "1Z999AA10123456784" }),
    }),
    ["parcels"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const parcel = (await created.json()) as {
    id: string;
    status: string;
    carrierGuess: string;
    watching: boolean;
    note: string;
    events: unknown[];
  };
  assert.equal(parcel.status, "stubbed");
  assert.equal(parcel.carrierGuess, "ups");
  assert.equal(parcel.watching, false);
  assert.equal(parcel.note, SHIP_STUB);
  assert.ok(parcel.id.startsWith("ss_"));
  assert.ok(parcel.events.length >= 1);

  const unauth = await handleShipSignalRest(
    new Request("http://localhost/v1/shipsignal/parcels", { method: "POST", body: "{}" }),
    ["parcels"],
    null,
  );
  assert.equal(unauth.status, 401);

  const listed = await handleShipSignalRest(
    new Request("http://localhost/v1/shipsignal/parcels"),
    ["parcels"],
    lookupKey(DEMO),
  );
  const listJson = (await listed.json()) as { parcels: unknown[] };
  assert.equal(listJson.parcels.length, 1);

  const watched = await handleShipSignalRest(
    new Request(`http://localhost/v1/shipsignal/parcels/${parcel.id}/watch`, { method: "POST" }),
    ["parcels", parcel.id, "watch"],
    lookupKey(DEMO),
  );
  const watchedJson = (await watched.json()) as { watching: boolean };
  assert.equal(watched.status, 200);
  assert.equal(watchedJson.watching, true);

  const refreshed = await handleShipSignalRest(
    new Request(`http://localhost/v1/shipsignal/parcels/${parcel.id}/refresh`, { method: "POST" }),
    ["parcels", parcel.id, "refresh"],
    lookupKey(DEMO),
  );
  assert.equal(refreshed.status, 200);

  const unwatched = await handleShipSignalRest(
    new Request(`http://localhost/v1/shipsignal/parcels/${parcel.id}/unwatch`, { method: "POST" }),
    ["parcels", parcel.id, "unwatch"],
    lookupKey(DEMO),
  );
  const unwatchedJson = (await unwatched.json()) as { watching: boolean };
  assert.equal(unwatchedJson.watching, false);

  const account = await handleShipSignalRest(
    new Request("http://localhost/v1/shipsignal/account"),
    ["account"],
    lookupKey(DEMO),
  );
  const accountJson = (await account.json()) as { parcelsTracked: number; plan: string };
  assert.equal(accountJson.parcelsTracked, 1);
  assert.equal(accountJson.plan, "stub");
});

test("shipsignal MCP initialize, tools/list, and tools/call", async () => {
  resetParcels();
  const initialized = await handleShipSignalMcp(
    new Request("http://localhost/mcp/shipsignal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
    }),
  );
  const initJson = (await initialized.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(initJson.result.serverInfo.name, "shipsignal");

  const listed = await handleShipSignalMcp(
    new Request("http://localhost/mcp/shipsignal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const listJson = (await listed.json()) as { result: { tools: { name: string }[] } };
  const names = listJson.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "check_credentials",
    "get_account",
    "list_parcels",
    "refresh_parcel",
    "track_package",
    "unwatch_parcel",
    "watch_parcel",
  ]);

  const called = await handleShipSignalMcp(
    new Request("http://localhost/mcp/shipsignal", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "track_package",
          arguments: { trackingNumber: "9400111899223344556677" },
        },
      }),
    }),
  );
  assert.equal(called.status, 200);
  const callJson = (await called.json()) as { result: { content: { text: string }[] } };
  assert.ok(callJson.result.content[0].text.includes("ss_"));
  assert.ok(callJson.result.content[0].text.includes("Gateway stub"));
});

test("dispatchRest and dispatchMcp wire sumvid, shipsignal, and *-send", async () => {
  resetSummaries();
  resetParcels();

  const sumvidInit = await dispatchMcp(
    new Request("http://localhost/mcp/sumvid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    }),
    "sumvid",
  );
  assert.equal(sumvidInit.status, 200);

  const shipInit = await dispatchMcp(
    new Request("http://localhost/mcp/shipsignal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    }),
    "shipsignal",
  );
  assert.equal(shipInit.status, 200);

  const signInit = await dispatchMcp(
    new Request("http://localhost/mcp/sign-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    }),
    "sign-send",
  );
  assert.equal(signInit.status, 200);

  const created = await dispatchRest(
    new Request("http://localhost/v1/sumvid/summaries", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ youtubeUrl: "dQw4w9WgXcQ" }),
    }),
    "sumvid",
    ["summaries"],
  );
  assert.equal(created.status, 201);

  const missing = await dispatchRest(
    new Request("http://localhost/v1/shipsignal/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: "1Z999AA10123456784" }),
    }),
    "shipsignal",
    ["parcels"],
  );
  assert.equal(missing.status, 401);

  const tracked = await dispatchRest(
    new Request("http://localhost/v1/shipsignal/parcels", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ trackingNumber: "1Z999AA10123456784" }),
    }),
    "shipsignal",
    ["parcels"],
  );
  assert.equal(tracked.status, 201);

  const unknown = await dispatchRest(
    new Request("http://localhost/v1/not-a-connector", { method: "GET" }),
    "not-a-connector",
    [],
  );
  assert.equal(unknown.status, 404);
});

