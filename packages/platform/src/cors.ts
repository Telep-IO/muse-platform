const DEFAULT_ORIGINS = [
  "https://muse.telep.io",
  "https://api.muse.telep.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function extraOrigins(): string[] {
  return [process.env.NEXT_PUBLIC_CATALOG_URL, process.env.NEXT_PUBLIC_API_URL].filter(
    (value): value is string => Boolean(value),
  );
}

export function allowedOrigins(): string[] {
  return [...new Set([...DEFAULT_ORIGINS, ...extraOrigins()])];
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith(".vercel.app")) return true;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  } catch {
    return false;
  }
  return false;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowOrigin = isAllowedOrigin(origin) ? origin! : allowedOrigins()[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, Mcp-Protocol-Version, MCP-Protocol-Version, Mcp-Method, Mcp-Session-Id, Mcp-Name",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
