export type JsonSchema = Record<string, unknown>;

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
