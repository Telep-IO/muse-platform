// Conformance checks every connector gets for free. A new connector passes these or it does not ship.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { CONNECTOR_CATEGORIES } from "@telep/registry";
import { connectorModules } from "../connectors";
import { dispatchRest } from "../lib/gateway";

const DEMO = "muse_sk_demo_localdev";
process.env.MUSE_API_KEYS = DEMO;
const envExample = readFileSync(".env.example", "utf8");

function mcpCall(mod: (typeof connectorModules)[number], method: string, params: Record<string, unknown> = {}) {
  return mod.mcp(
    new Request(`http://localhost/mcp/${mod.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEMO}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
}

test("every connectors/* folder is registered in connectors/index.ts, once", () => {
  const folders = readdirSync("connectors", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const slugs = connectorModules.map((mod) => mod.slug);
  assert.deepEqual([...slugs].sort(), folders.sort());
  assert.equal(new Set(slugs).size, slugs.length);
});

for (const mod of connectorModules) {
  const { slug, listing } = mod;
  const prefix = slug.toUpperCase().replace(/-/g, "_");

  test(`${slug}: listing, icon, and env are complete`, () => {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(CONNECTOR_CATEGORIES.includes(listing.category));
    for (const field of ["oneLiner", "pricingBlurb", "howMuseUsesIt"] as const) assert.ok(listing[field].trim(), field);
    assert.ok(listing.examplePrompts.length >= 2, "at least two example prompts");
    assert.ok(listing.docs.createEndpoint.startsWith(`/v1/${slug}/`), "docs.createEndpoint is under /v1/{slug}/");
    JSON.parse(listing.docs.createExampleBody);
    assert.ok(listing.legal.privacy.length && listing.legal.terms.length, "privacy and terms sections");
    assert.match(JSON.stringify(listing.legal), /independent of Meta/i);
    assert.ok(existsSync(`docs/muse-connector/icons/${slug}.png`), `docs/muse-connector/icons/${slug}.png`);
    assert.match(envExample, new RegExp(`^${prefix}_APP_MODE=`, "m"), `${prefix}_APP_MODE in .env.example`);
  });

  test(`${slug}: OpenAPI paths stay under /v1/${slug}`, () => {
    const paths = Object.keys(mod.openapi().paths);
    assert.ok(paths.length > 1);
    for (const path of paths) assert.ok(path.startsWith(`/v1/${slug}`), path);
  });

  test(`${slug}: MCP tools are unique snake_case with object schemas`, async () => {
    const res = await mcpCall(mod, "tools/list");
    const tools = ((await res.json()) as { result: { tools: { name: string; inputSchema: { type?: string } }[] } }).result.tools;
    const names = tools.map((tool) => tool.name);
    assert.ok(names.includes("check_credentials"));
    assert.equal(new Set(names).size, names.length);
    for (const tool of tools) {
      assert.match(tool.name, /^[a-z][a-z0-9_]*$/, tool.name);
      assert.equal(tool.inputSchema.type, "object", tool.name);
    }
  });

  test(`${slug}: demo check_credentials makes no outbound HTTP`, async () => {
    const realFetch = globalThis.fetch;
    const mode = process.env[`${prefix}_APP_MODE`];
    delete process.env[`${prefix}_APP_MODE`];
    globalThis.fetch = () => Promise.reject(new Error(`${slug} called fetch in demo mode`));
    try {
      const res = await mcpCall(mod, "tools/call", { name: "check_credentials", arguments: {} });
      const body = (await res.json()) as { result?: { isError?: boolean }; error?: unknown };
      assert.equal(body.error, undefined);
      assert.notEqual(body.result?.isError, true);
    } finally {
      globalThis.fetch = realFetch;
      if (mode !== undefined) process.env[`${prefix}_APP_MODE`] = mode;
    }
  });

  test(`${slug}: REST descriptor is public, writes need a key`, async () => {
    const desc = await mod.rest(new Request(`http://localhost/v1/${slug}`), [], null);
    assert.equal(desc.status, 200);
    assert.equal(((await desc.json()) as { slug: string }).slug, slug);
    const path = listing.docs.createEndpoint.split("/").slice(3);
    const create = await dispatchRest(
      new Request(`http://localhost${listing.docs.createEndpoint}`, { method: "POST", body: listing.docs.createExampleBody }),
      slug,
      path,
    );
    assert.equal(create.status, 401);
  });
}
