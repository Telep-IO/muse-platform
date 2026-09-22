export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: { name?: string; email?: string; url?: string };
  };
  servers?: { url: string; description?: string }[];
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  tags?: { name: string; description?: string }[];
};

export function emptySpec(info: OpenApiDocument["info"]): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info,
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
          description: "Authorization: Bearer muse_sk_{demo|test|live}_{token}",
        },
      },
    },
  };
}

export function mergeOpenApi(base: OpenApiDocument, parts: OpenApiDocument[]): OpenApiDocument {
  const paths: Record<string, unknown> = { ...base.paths };
  const tags = [...(base.tags ?? [])];
  const components: Record<string, unknown> = { ...(base.components ?? {}) };

  for (const part of parts) {
    Object.assign(paths, part.paths);
    if (part.tags) tags.push(...part.tags);
    if (part.components) {
      for (const [key, value] of Object.entries(part.components)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          components[key] = {
            ...((components[key] as Record<string, unknown>) ?? {}),
            ...(value as Record<string, unknown>),
          };
        } else {
          components[key] = value;
        }
      }
    }
  }

  const seen = new Set<string>();
  const uniqueTags = tags.filter((tag) => {
    if (seen.has(tag.name)) return false;
    seen.add(tag.name);
    return true;
  });

  return {
    openapi: "3.1.0",
    info: base.info,
    servers: base.servers,
    paths,
    components,
    tags: uniqueTags,
  };
}

const ok = { "200": { description: "OK" } };

function bearer() {
  return [{ bearerAuth: [] }];
}

function idParams() {
  return [{ name: "id", in: "path" as const, required: true, schema: { type: "string" } }];
}

export function connectorSpec(info: { title: string; description: string; tag: string; tagDescription: string }, paths: OpenApiDocument["paths"]): OpenApiDocument {
  const spec = emptySpec({
    title: info.title,
    version: "0.1.0",
    description: info.description,
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: info.tag, description: info.tagDescription }];
  spec.paths = paths;
  return spec;
}

export function descriptorPath(tag: string) {
  return { get: { tags: [tag], summary: "Connector descriptor", responses: ok } };
}

export function openApiSelfPath(tag: string) {
  return { get: { tags: [tag], summary: "This OpenAPI document", responses: ok } };
}

export function postalAddress(opts?: { line2?: boolean; country?: boolean }) {
  return {
    type: "object" as const,
    required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
    properties: {
      name: { type: "string" },
      address_line1: { type: "string" },
      ...(opts?.line2 ? { address_line2: { type: "string" } } : {}),
      address_city: { type: "string" },
      address_state: { type: "string" },
      address_zip: { type: "string" },
      ...(opts?.country ? { address_country: { type: "string", default: "US" } } : {}),
    },
  };
}

export function authedGet(tag: string, summary: string, byId = false) {
  return {
    get: {
      tags: [tag],
      summary,
      security: bearer(),
      ...(byId ? { parameters: idParams() } : {}),
      responses: byId
        ? { "200": { description: "OK" }, "404": { description: "Not found" } }
        : { "200": { description: "OK" }, "401": { description: "Missing key" } },
    },
  };
}

export function listAndCreate(
  tag: string,
  listSummary: string,
  createSummary: string,
  schema: Record<string, unknown>,
  withInvalid = false,
) {
  const responses: Record<string, { description: string }> = { "201": { description: "Created" } };
  if (withInvalid) responses["400"] = { description: "Invalid request" };
  responses["401"] = { description: "Missing key" };
  return {
    get: {
      tags: [tag],
      summary: listSummary,
      security: bearer(),
      responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
    },
    post: {
      tags: [tag],
      summary: createSummary,
      security: bearer(),
      requestBody: { required: true, content: { "application/json": { schema } } },
      responses,
    },
  };
}

export function checkoutPath(tag: string) {
  return {
    post: {
      tags: [tag],
      summary: "Create a checkout session (stub)",
      security: bearer(),
      parameters: idParams(),
      responses: {
        "200": { description: "OK" },
        "404": { description: "Not found" },
        "409": { description: "Not a draft" },
      },
    },
  };
}

export function demoEventPath(tag: string, summary: string, events: string[], extra?: Record<string, unknown>) {
  return {
    post: {
      tags: [tag],
      summary,
      security: bearer(),
      parameters: idParams(),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["event"],
              properties: { event: { type: "string", enum: events }, ...extra },
            },
          },
        },
      },
      responses: { "200": { description: "OK" }, "400": { description: "Invalid transition" } },
    },
  };
}

export function actionPost(tag: string, summary: string) {
  return {
    post: {
      tags: [tag],
      summary,
      security: bearer(),
      parameters: idParams(),
      responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
    },
  };
}

export function authedPost(tag: string, summary: string, schema: Record<string, unknown>, responses: Record<string, { description: string }>) {
  return {
    post: {
      tags: [tag],
      summary,
      security: bearer(),
      requestBody: { required: true, content: { "application/json": { schema } } },
      responses,
    },
  };
}
