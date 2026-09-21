import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getConnector, listConnectors } from "@telep/registry";
import { authenticate, isApiHost, KEY_PATTERN, lookupKey } from "@telep/platform";
import { handlePaperSendMcp, handlePaperSendRest, resetJobs } from "@telep/paper-send";
import { healthPayload, v1Index } from "../lib/gateway";

const DEMO = "muse_sk_demo_localdev";

before(() => {
  process.env.MUSE_API_KEYS = DEMO;
  process.env.NEXT_PUBLIC_CATALOG_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
});

after(() => {
  resetJobs();
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

test("v1 index lists paper-send", () => {
  const index = v1Index();
  const paper = index.connectors.find((c) => c.slug === "paper-send");
  assert.ok(paper);
  assert.equal(paper?.gatewayImplemented, true);
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
  assert.deepEqual(names.sort(), ["create_mail_job", "get_job", "list_jobs"].sort());

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
