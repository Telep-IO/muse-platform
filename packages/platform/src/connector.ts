import type { AuthResult } from "./auth";
import { catalogOrigin } from "./hosts";
import { draftRest } from "./draft";
import { createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, mcpNoArgTool, type McpTool } from "./mcp";
import {
  actionPost,
  authedGet,
  authedPost,
  checkoutPath,
  connectorSpec,
  demoEventPath,
  descriptorPath,
  listAndCreate,
  openApiSelfPath,
  type OpenApiDocument,
} from "./openapi";

export type CreateCtx = { keyId: string; catalogOrigin: string; live: boolean };

type Resource<T> = {
  name: string;
  missing: string;
  list: (ownerKeyId: string) => T[] | Promise<T[]>;
  get: (id: string, ownerKeyId: string) => T | undefined | Promise<T | undefined>;
  present: (item: T) => unknown;
  summaries: { list: string; create: string; get: string };
  schema: Record<string, unknown>;
  invalid?: boolean;
  create: (body: Record<string, unknown>, ctx: CreateCtx) => T | Promise<T>;
  tool: { name: string; description: string; schema?: Record<string, unknown> };
  getTool?: { name: string; description: string };
  listTool?: { name: string; description: string };
  checkout?: { label: string; noun: string };
  demo?: {
    summary: string;
    events: string[];
    extra?: Record<string, unknown>;
    run: (id: string, ownerKeyId: string, event: string, body: Record<string, unknown>) => T | Promise<T>;
  };
  actions?: {
    rest: string;
    summary: string;
    tool?: { name: string; description: string };
    run: (id: string, ownerKeyId: string) => Promise<T | undefined> | T | undefined;
  }[];
};

export type ConnectorDef<T> = {
  slug: string;
  name: string;
  status: string;
  price?: string;
  limits?: string;
  descriptor: () => Record<string, unknown>;
  gate?: () => { mode: string; ready: () => void };
  check: { description: string; run: () => Promise<unknown> | unknown };
  quote?: (request: Request) => unknown;
  account?: { run: (ownerKeyId: string) => unknown | Promise<unknown>; description: string };
  indexTools?: boolean;
  openapi: { description: string; tagDescription: string; self?: boolean };
  extraGets?: { path: string; summary: string }[];
  extraPosts?: { path: string; summary: string; schema: Record<string, unknown> }[];
  beforeTools?: McpTool[];
  match?: (request: Request, segments: string[], auth: AuthResult | null) => Promise<Response | undefined>;
  resource: Resource<T>;
};

function closed(schema: Record<string, unknown>): Record<string, unknown> {
  if ("additionalProperties" in schema) return schema;
  const { type, ...rest } = schema;
  return type === undefined ? { additionalProperties: false, ...schema } : { type, additionalProperties: false, ...rest };
}

export function defineConnector<T>(def: ConnectorDef<T>) {
  const resource = def.resource;

  async function runCreate(body: Record<string, unknown>, auth: AuthResult) {
    let live = false;
    if (def.gate) {
      const runtime = def.gate();
      if (runtime.mode !== "demo") runtime.ready();
      live = runtime.mode !== "demo";
    }
    return resource.create(body, { keyId: auth.keyId, catalogOrigin: catalogOrigin(), live });
  }

  const tools: McpTool[] = [
    mcpCheckTool(def.check.description, () => def.check.run()),
    ...(def.beforeTools ?? []),
    {
      name: resource.tool.name,
      description: resource.tool.description,
      inputSchema: resource.tool.schema ?? closed(resource.schema),
      async handler(args, ctx) {
        return resource.present(await runCreate(args, mcpAuth(ctx)));
      },
    },
  ];
  if (resource.getTool) {
    tools.push(
      mcpGetTool(resource.getTool.name, resource.getTool.description, resource.missing, async (id, owner) => {
        const item = await resource.get(id, owner);
        return item && resource.present(item);
      }),
    );
  }
  if (resource.listTool) {
    tools.push(
      mcpListTool(resource.listTool.name, resource.listTool.description, resource.name, async (owner) =>
        (await resource.list(owner)).map(resource.present),
      ),
    );
  }
  for (const action of resource.actions ?? []) {
    if (!action.tool) continue;
    tools.push(
      mcpGetTool(action.tool.name, action.tool.description, resource.missing, async (id, owner) => {
        const item = await action.run(id, owner);
        return item && resource.present(item);
      }),
    );
  }
  if (def.account) {
    tools.push(mcpNoArgTool("get_account", def.account.description, (owner) => def.account!.run(owner)));
  }

  const openapi = (): OpenApiDocument => {
    const tag = def.slug;
    const base = `/v1/${tag}`;
    const item = `${base}/${resource.name}`;
    const paths: OpenApiDocument["paths"] = { [base]: descriptorPath(tag) };
    if (def.openapi.self) paths[`${base}/openapi.json`] = openApiSelfPath(tag);
    for (const get of def.extraGets ?? []) paths[get.path] = authedGet(tag, get.summary);
    for (const post of def.extraPosts ?? []) {
      paths[post.path] = authedPost(tag, post.summary, post.schema, {
        "200": { description: "OK" },
        "401": { description: "Missing key" },
      });
    }
    if (def.account) paths[`${base}/account`] = authedGet(tag, "Stub account");
    paths[item] = listAndCreate(tag, resource.summaries.list, resource.summaries.create, resource.schema, resource.invalid);
    paths[`${item}/{id}`] = authedGet(tag, resource.summaries.get, true);
    if (resource.checkout) paths[`${item}/{id}/checkout`] = checkoutPath(tag);
    if (resource.demo) paths[`${item}/{id}/demo-event`] = demoEventPath(tag, resource.demo.summary, resource.demo.events, resource.demo.extra);
    for (const action of resource.actions ?? []) paths[`${item}/{id}/${action.rest}`] = actionPost(tag, action.summary);
    return connectorSpec(
      { title: def.name, description: def.openapi.description, tag, tagDescription: def.openapi.tagDescription },
      paths,
    );
  };

  const rest = draftRest({
    slug: def.slug,
    index: () => {
      const endpoints: Record<string, string> = { [resource.name]: `/v1/${def.slug}/${resource.name}` };
      if (def.account) endpoints.account = `/v1/${def.slug}/account`;
      if (def.quote) endpoints.quote = `/v1/${def.slug}/quote`;
      endpoints.check = `/v1/${def.slug}/check`;
      endpoints.openapi = `/v1/${def.slug}/openapi.json`;
      endpoints.mcp = `/mcp/${def.slug}`;
      return {
        slug: def.slug,
        name: def.name,
        status: def.status,
        ...(def.price ? { price: def.price } : {}),
        ...(def.limits ? { limits: def.limits } : {}),
        ...def.descriptor(),
        endpoints,
        ...(def.indexTools ? { mcpTools: tools.filter((tool) => tool.name !== "check_credentials").map((tool) => tool.name) } : {}),
      };
    },
    openApi: openapi,
    check: def.check.run,
    quote: def.quote,
    reads: def.account ? { account: (auth) => def.account!.run(auth.keyId) } : undefined,
    match: def.match,
    collection: {
      name: resource.name,
      listKey: resource.name,
      missing: resource.missing,
      list: resource.list,
      get: resource.get,
      present: resource.present,
      create: (body, auth) => runCreate(body, auth),
      checkout: resource.checkout,
      demoEvent: resource.demo ? (id, owner, event, body) => resource.demo!.run(id, owner, event, body) : undefined,
      actions: resource.actions
        ? Object.fromEntries(resource.actions.map((action) => [action.rest, (id: string, auth: AuthResult) => action.run(id, auth.keyId)]))
        : undefined,
    },
  });

  return {
    rest,
    mcp: createMcpHandler({ name: def.slug, version: "0.1.0", tools }),
    openapi,
    tools,
  };
}
