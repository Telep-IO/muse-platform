import { authenticate, AuthError, type AuthResult } from "./auth";
import { jsonError } from "./errors";
import { withCors } from "./cors";

export function mcpAuth(ctx: { auth: AuthResult | null }): AuthResult {
  if (!ctx.auth) throw new Error("API key required");
  return ctx.auth;
}

export const mcpEmptySchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

export const mcpIdSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string" } },
};

export function mcpCheckTool(description: string, run: () => Promise<unknown> | unknown): McpTool {
  return {
    name: "check_credentials",
    description,
    inputSchema: mcpEmptySchema,
    async handler(_args, ctx) {
      mcpAuth(ctx);
      return run();
    },
  };
}

export function mcpGetTool(
  name: string,
  description: string,
  missing: string,
  load: (id: string, ownerKeyId: string) => unknown | Promise<unknown>,
): McpTool {
  return {
    name,
    description,
    inputSchema: mcpIdSchema,
    async handler(args, ctx) {
      const item = await load(String(args.id), mcpAuth(ctx).keyId);
      if (item == null) throw new Error(missing);
      return item;
    },
  };
}

export function mcpNoArgTool(name: string, description: string, run: (ownerKeyId: string) => Promise<unknown> | unknown): McpTool {
  return {
    name,
    description,
    inputSchema: mcpEmptySchema,
    async handler(_args, ctx) {
      return run(mcpAuth(ctx).keyId);
    },
  };
}

export function mcpListTool(
  name: string,
  description: string,
  key: string,
  list: (ownerKeyId: string) => unknown[] | Promise<unknown[]>,
): McpTool {
  return {
    name,
    description,
    inputSchema: mcpEmptySchema,
    async handler(_args, ctx) {
      return { [key]: await list(mcpAuth(ctx).keyId) };
    },
  };
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: { auth: AuthResult | null }) => Promise<unknown>;
};

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function createMcpHandler(opts: {
  name: string;
  version: string;
  tools: McpTool[];
}): (request: Request) => Promise<Response> {
  const toolMap = new Map(opts.tools.map((tool) => [tool.name, tool]));

  return async function handleMcp(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }
    if (request.method === "GET") {
      return withCors(
        request,
        Response.json({
          name: opts.name,
          version: opts.version,
          transport: "streamable-http",
          protocol: "mcp",
          tools: opts.tools.map((tool) => tool.name),
        }),
      );
    }
    if (request.method !== "POST") {
      return withCors(request, jsonError(405, "method_not_allowed", "Use POST for MCP JSON-RPC"));
    }

    let body: JsonRpc;
    try {
      body = (await request.json()) as JsonRpc;
    } catch {
      return withCors(request, jsonError(400, "invalid_json", "Body must be JSON-RPC"));
    }

    const method = body.method ?? request.headers.get("mcp-method") ?? "";

    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    if (method === "initialize") {
      return withCors(
        request,
        Response.json(
          rpcResult(body.id, {
            protocolVersion: "2025-03-26",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: opts.name, version: opts.version },
            instructions: `${opts.name} MCP server on the Telep Muse gateway.`,
          }),
        ),
      );
    }

    if (method === "ping") {
      return withCors(request, Response.json(rpcResult(body.id, {})));
    }

    if (method === "tools/list") {
      return withCors(
        request,
        Response.json(
          rpcResult(body.id, {
            tools: opts.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          }),
        ),
      );
    }

    if (method === "tools/call") {
      let auth: AuthResult | null = null;
      try {
        auth = authenticate(request, { required: true });
      } catch (error) {
        if (error instanceof AuthError) {
          return withCors(
            request,
            Response.json(rpcError(body.id, -32001, error.message), { status: 401 }),
          );
        }
        throw error;
      }

      const name = String(body.params?.name ?? "");
      const tool = toolMap.get(name);
      if (!tool) {
        return withCors(
          request,
          Response.json(rpcError(body.id, -32601, `Unknown tool: ${name}`), { status: 404 }),
        );
      }
      const args = (body.params?.arguments as Record<string, unknown> | undefined) ?? {};
      try {
        const result = await tool.handler(args, { auth });
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return withCors(
          request,
          Response.json(
            rpcResult(body.id, {
              content: [{ type: "text", text }],
              structuredContent: typeof result === "object" ? result : undefined,
            }),
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed";
        return withCors(
          request,
          Response.json(
            rpcResult(body.id, {
              content: [{ type: "text", text: message }],
              isError: true,
            }),
          ),
        );
      }
    }

    return withCors(
      request,
      Response.json(rpcError(body.id, -32601, `Method not found: ${method}`), { status: 404 }),
    );
  };
}
