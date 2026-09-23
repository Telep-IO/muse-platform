import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createDraftStore, dispatchStripeEvent, handleWebhook, lookupKey, type PaidSession, type QueryFn } from "@telep/platform";
import { createJob, fulfillPaperPayment, handlePaperSendRest, resetJobs, sendPaperLetter, useJobStore, type Job } from "@telep/paper-send";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetJobs();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Row = {
  id: string;
  connector: string;
  owner_key_id: string;
  status: string;
  payload: string;
  created_at: string;
};

function fakeQuery() {
  const drafts: Row[] = [];
  const events = new Set<string>();
  const query: QueryFn = async (sql, params = []) => {
    const compact = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (compact.startsWith("create")) return { rows: [], rowCount: 0 };
    if (compact.startsWith("insert into muse_stripe_events")) {
      const id = String(params[0]);
      if (events.has(id)) return { rows: [], rowCount: 0 };
      events.add(id);
      return { rows: [], rowCount: 1 };
    }
    if (compact.startsWith("insert into muse_drafts")) {
      const row: Row = {
        id: String(params[0]),
        connector: String(params[1]),
        owner_key_id: String(params[2]),
        status: String(params[3]),
        payload: String(params[4]),
        created_at: String(params[7]),
      };
      const index = drafts.findIndex((item) => item.id === row.id && item.connector === row.connector);
      if (index >= 0) drafts[index] = { ...row, created_at: drafts[index].created_at };
      else drafts.push(row);
      return { rows: [{ payload: JSON.parse(row.payload) }], rowCount: 1 };
    }
    if (compact.startsWith("select payload")) {
      if (compact.includes("owner_key_id = $3")) {
        const row = drafts.find(
          (item) => item.id === params[0] && item.connector === params[1] && item.owner_key_id === params[2],
        );
        return row ? { rows: [{ payload: JSON.parse(row.payload) }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (compact.includes("order by")) {
        const rows = drafts
          .filter((item) => item.connector === params[0] && item.owner_key_id === params[1])
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((item) => ({ payload: JSON.parse(item.payload) }));
        return { rows, rowCount: rows.length };
      }
      const row = drafts.find((item) => item.id === params[0] && item.connector === params[1]);
      return row ? { rows: [{ payload: JSON.parse(row.payload) }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { query, drafts, events };
}

function address(name: string, line: string) {
  return { name, address_line1: line, address_city: "Cleveland", address_state: "OH", address_zip: "44113" };
}

function session(job: Job, eventId = "evt_1", extra: Partial<PaidSession> = {}): PaidSession {
  return {
    id: "cs_test_1",
    eventId,
    eventType: "checkout.session.completed",
    paymentStatus: "paid",
    livemode: false,
    metadata: { connector: "paper-send", jobId: job.id },
    amountSubtotal: job.amountCents,
    currency: "usd",
    ...extra,
  };
}

const liveEnv = {
  PAPER_SEND_APP_MODE: "test",
  PAPER_SEND_LOB_API_KEY: "test_example",
  PAPER_SEND_DATABASE_URL: "postgres://unit-test.invalid/papersend",
};

test("durable draft store round-trips through a mocked pg query and records an event once", async () => {
  const fake = fakeQuery();
  const store = createDraftStore<Job>({ connector: "paper-send", query: fake.query });
  const job: Job = {
    id: "ps_store",
    status: "draft",
    sender: address("A", "1 Main"),
    recipient: address("B", "2 Main"),
    document: { filename: "letter.pdf", pages: 1 },
    amountCents: 499,
    currency: "usd",
    reviewUrl: "http://localhost/review",
    createdAt: "2026-09-23T00:00:00.000Z",
    ownerKeyId: "key_a",
    note: "draft",
    fulfillment: "live",
  };
  await store.save(job);
  await store.save({ ...job, status: "paid", note: "paid" });
  const loaded = await store.get("ps_store", "key_a");
  assert.equal(loaded?.status, "paid");
  assert.equal(await store.get("ps_store", "someone-else"), undefined);
  const listed = await store.list("key_a");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].note, "paid");
  assert.equal(await store.recordEvent("evt_1", "ps_store"), true);
  assert.equal(await store.recordEvent("evt_1", "ps_store"), false);
  assert.equal(fake.events.has("evt_1"), true);
});

test("test/live create without a database URL refuses and does not call Lob", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({});
  };
  await assert.rejects(
    () =>
      createJob({
        sender: address("A", "1 Main"),
        recipient: address("B", "2 Main"),
        ownerKeyId: "k",
        catalogOrigin: "http://localhost:3000",
        live: true,
      }),
    (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : "", "DATABASE_URL required");
      return true;
    },
  );
  assert.equal(called, false);
});

test("test mode without a Lob key still stores a draft and does not call Lob", async () => {
  const fake = fakeQuery();
  useJobStore(createDraftStore<Job>({ connector: "paper-send", query: fake.query }));
  const previous = {
    mode: process.env.PAPER_SEND_APP_MODE,
    database: process.env.PAPER_SEND_DATABASE_URL,
    lob: process.env.PAPER_SEND_LOB_API_KEY,
    keys: process.env.MUSE_API_KEYS,
  };
  process.env.PAPER_SEND_APP_MODE = "test";
  process.env.PAPER_SEND_DATABASE_URL = "postgres://unit-test.invalid/papersend";
  delete process.env.PAPER_SEND_LOB_API_KEY;
  process.env.MUSE_API_KEYS = "muse_sk_demo_localdev";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({});
  };
  try {
    const created = await handlePaperSendRest(
      new Request("http://localhost/v1/paper-send/jobs", {
        method: "POST",
        headers: { Authorization: "Bearer muse_sk_demo_localdev", "Content-Type": "application/json" },
        body: JSON.stringify({ sender: address("A", "1 Main"), recipient: address("B", "2 Main") }),
      }),
      ["jobs"],
      lookupKey("muse_sk_demo_localdev"),
    );
    assert.equal(created.status, 201);
    const job = (await created.json()) as { status: string; note: string };
    assert.equal(job.status, "draft");
    assert.match(job.note, /Nothing has been transmitted/);
    assert.equal(called, false);
  } finally {
    restoreEnv("PAPER_SEND_APP_MODE", previous.mode);
    restoreEnv("PAPER_SEND_DATABASE_URL", previous.database);
    restoreEnv("PAPER_SEND_LOB_API_KEY", previous.lob);
    restoreEnv("MUSE_API_KEYS", previous.keys);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("demo mode never calls Lob", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({});
  };
  const job = await createJob({
    sender: address("A", "1 Main"),
    recipient: address("B", "2 Main"),
    ownerKeyId: "k",
    catalogOrigin: "http://localhost:3000",
  });
  assert.equal(job.status, "stubbed");
  assert.equal(job.fulfillment, "stub");
  const result = await fulfillPaperPayment(session(job), { PAPER_SEND_APP_MODE: "demo", PAPER_SEND_LOB_API_KEY: "test_example" });
  assert.equal(result.reason, "demo");
  assert.equal(result.lobCalled, false);
  await assert.rejects(() => sendPaperLetter(job, { PAPER_SEND_APP_MODE: "demo", PAPER_SEND_LOB_API_KEY: "test_example" }), /does not call Lob/);
  assert.equal(called, false);
});

test("paid webhook asks Lob once and a replay does not mail again", async () => {
  const fake = fakeQuery();
  useJobStore(createDraftStore<Job>({ connector: "paper-send", query: fake.query }));
  const calls: { url: string; method: string; idempotency: string; body: string; auth: string }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      idempotency: String(new Headers(init?.headers).get("idempotency-key")),
      body: String(init?.body ?? ""),
      auth: String(new Headers(init?.headers).get("authorization")),
    });
    return jsonResponse({ id: "ltr_testletter", status: "rendered", expected_delivery_date: "2026-10-01" });
  };

  const job = await createJob(
    {
      sender: address("A", "1 Main"),
      recipient: address("B", "2 Main"),
      document: { filename: "letter.pdf", pages: 2 },
      ownerKeyId: "k",
      catalogOrigin: "http://localhost:3000",
      live: true,
    },
    liveEnv,
  );
  assert.equal(job.status, "draft");
  assert.match(job.note, /Nothing has been transmitted/);

  const first = await fulfillPaperPayment(session(job), liveEnv);
  assert.equal(first.fulfilled, true);
  assert.equal(first.lobCalled, true);
  assert.equal(first.lobId, "ltr_testletter");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.lob.com/v1/letters");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].idempotency, `letter-${job.id}`);
  assert.match(calls[0].body, /color=false/);
  assert.match(calls[0].body, new RegExp(job.id));
  assert.equal(calls[0].body.includes("test_example"), false);
  assert.ok(calls[0].auth.startsWith("Basic "));

  const stored = await createDraftStore<Job>({ connector: "paper-send", query: fake.query }).getById(job.id);
  // The store above is a new wrapper over the same query, so it sees the same rows.
  assert.equal(stored?.status, "submitted");
  assert.equal(stored?.lobId, "ltr_testletter");

  const second = await fulfillPaperPayment(session(job, "evt_2"), liveEnv);
  assert.equal(second.duplicate, true);
  assert.equal(second.lobCalled, false);
  assert.equal(calls.length, 1);
});

test("missing Lob key and a live key in test mode do not pretend a letter was sent", async () => {
  const fake = fakeQuery();
  useJobStore(createDraftStore<Job>({ connector: "paper-send", query: fake.query }));
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({ id: "ltr_should_not_exist" });
  };
  const job = await createJob(
    {
      sender: address("A", "1 Main"),
      recipient: address("B", "2 Main"),
      ownerKeyId: "k",
      catalogOrigin: "http://localhost:3000",
      live: true,
    },
    liveEnv,
  );

  const missing = await fulfillPaperPayment(session(job), { ...liveEnv, PAPER_SEND_LOB_API_KEY: "" });
  assert.equal(missing.fulfilled, false);
  assert.equal(missing.lobCalled, false);
  assert.equal(missing.reason, "missing_lob_key");
  assert.equal(missing.retry, true);

  const wrongPrefix = await fulfillPaperPayment(session(job, "evt_prefix"), {
    ...liveEnv,
    PAPER_SEND_LOB_API_KEY: "live_secret",
  });
  assert.equal(wrongPrefix.lobCalled, false);
  assert.equal(wrongPrefix.fulfilled, false);
  assert.match(wrongPrefix.reason ?? "", /test_/);
  assert.equal(called, false);

  const saved = await createDraftStore<Job>({ connector: "paper-send", query: fake.query }).getById(job.id);
  assert.notEqual(saved?.status, "submitted");
  assert.equal(saved?.lobId, undefined);
});

test("webhook stub mode does not fulfill, and only paid checkout events are dispatched", async () => {
  let fulfilled = 0;
  const stub = await handleWebhook("{}", null, async () => {
    fulfilled += 1;
    return { fulfilled: true, lobCalled: true };
  });
  assert.equal(stub.stub, true);
  assert.equal(fulfilled, 0);

  const ignored = await dispatchStripeEvent({ id: "evt_other", type: "invoice.paid", data: { object: {} } }, async () => {
    fulfilled += 1;
    return { fulfilled: true, lobCalled: true };
  });
  assert.equal(ignored.type, "invoice.paid");
  assert.equal(fulfilled, 0);

  const unpaid = await dispatchStripeEvent(
    {
      id: "evt_unpaid",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", payment_status: "unpaid", metadata: { connector: "paper-send", jobId: "ps_x" } } },
    },
    async () => {
      fulfilled += 1;
      return { fulfilled: true, lobCalled: true };
    },
  );
  assert.equal(unpaid.reason, "unpaid");
  assert.equal(fulfilled, 0);

  const paid = await dispatchStripeEvent(
    {
      id: "evt_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          payment_status: "paid",
          livemode: false,
          amount_subtotal: 499,
          currency: "usd",
          metadata: { connector: "paper-send", jobId: "ps_x" },
        },
      },
    },
    async (session) => {
      fulfilled += 1;
      assert.equal(session.metadata.jobId, "ps_x");
      assert.equal(session.metadata.connector, "paper-send");
      return { fulfilled: false, lobCalled: false, reason: "demo" };
    },
  );
  assert.equal(fulfilled, 1);
  assert.equal(paid.fulfilled, false);
  assert.equal(paid.reason, "demo");
  assert.equal(paid.lobCalled, false);
});
