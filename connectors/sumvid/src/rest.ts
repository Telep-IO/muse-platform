import { errorResponse, jsonError, withCors, type AuthResult } from "@telep/platform";
import { getSummary, listSummaries, publicSummary } from "./summaries";
import { checkSumvid, summarize, sumvidAccount, sumvidDescriptor } from "./provider";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleSumvidRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "sumvid",
        name: "Sumvid",
        status: "ready",
        ...sumvidDescriptor(),
        endpoints: {
          summaries: "/v1/sumvid/summaries",
          account: "/v1/sumvid/account",
          check: "/v1/sumvid/check",
          openapi: "/v1/sumvid/openapi.json",
          mcp: "/mcp/sumvid",
        },
        mcpTools: ["summarize_youtube", "get_summary", "get_account"],
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { sumvidOpenApi } = await import("./openapi");
    return withCors(request, Response.json(sumvidOpenApi()));
  }

  if (segments[0] === "check" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    try {
      return withCors(request, Response.json(await checkSumvid()));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "account" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    return withCors(request, Response.json(sumvidAccount(auth.keyId)));
  }

  if (segments[0] === "summaries" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    return withCors(request, Response.json({ summaries: listSummaries(auth.keyId).map(publicSummary) }));
  }

  if (segments[0] === "summaries" && segments.length === 1 && request.method === "POST") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const body = await readJson(request);
    try {
      const summary = await summarize({
        youtubeUrl: body.youtubeUrl ?? body.url,
        language: body.language,
        ownerKeyId: auth.keyId,
      });
      return withCors(request, Response.json(publicSummary(summary), { status: 201 }));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "summaries" && segments.length === 2 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const summary = getSummary(segments[1], auth.keyId);
    if (!summary) return withCors(request, jsonError(404, "not_found", "Summary not found"));
    return withCors(request, Response.json(publicSummary(summary)));
  }

  return withCors(request, jsonError(404, "not_found", `Unknown sumvid path /${segments.join("/")}`));
}
