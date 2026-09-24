import { getModule } from "@/connectors";
import type { ConnectorDocsNotes } from "@telep/registry";

export type { ConnectorDocsSection } from "@telep/registry";

export interface ConnectorToolParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ConnectorToolDoc {
  name: string;
  description: string;
  params: ConnectorToolParamDoc[];
}

export type ConnectorDocs = ConnectorDocsNotes & { tools: ConnectorToolDoc[] };

function toolParams(schema: Record<string, unknown>): ConnectorToolParamDoc[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return Object.entries(properties as Record<string, Record<string, unknown>>).map(([name, prop]) => ({
    name,
    type: String(prop.type ?? "object"),
    required: required.has(name),
    description: typeof prop.description === "string" ? prop.description : "",
  }));
}

export function getConnectorDocs(slug: string): ConnectorDocs | undefined {
  const mod = getModule(slug);
  if (!mod) return undefined;
  return {
    ...mod.listing.docs,
    tools: mod.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      params: toolParams(tool.inputSchema),
    })),
  };
}
