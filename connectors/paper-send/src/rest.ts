import { catalogOrigin, errorResponse, jsonError, withCors, type AuthResult } from "@telep/platform";
import { createJob, getJob, listJobs, publicJob } from "./jobs";
import { assertPaperReady, checkPaper, paperDescriptor, paperRuntime, quotePaper } from "./provider";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handlePaperSendRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "paper-send",
        name: "PaperSend",
        status: "submitted",
        ...paperDescriptor(),
        endpoints: {
          jobs: "/v1/paper-send/jobs",
          quote: "/v1/paper-send/quote",
          check: "/v1/paper-send/check",
          openapi: "/v1/paper-send/openapi.json",
          mcp: "/mcp/paper-send",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { paperSendOpenApi } = await import("./openapi");
    return withCors(request, Response.json(paperSendOpenApi()));
  }

  if (segments[0] === "check" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    try {
      return withCors(request, Response.json(await checkPaper()));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "quote" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const pages = Number(new URL(request.url).searchParams.get("pages") ?? "1");
    return withCors(request, Response.json(quotePaper(pages)));
  }

  if (segments[0] === "jobs" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    return withCors(request, Response.json({ jobs: listJobs(auth.keyId).map(publicJob) }));
  }

  if (segments[0] === "jobs" && segments.length === 1 && request.method === "POST") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const body = await readJson(request);
    try {
      const runtime = paperRuntime();
      if (runtime.mode !== "demo") assertPaperReady();
      const job = createJob({
        sender: body.sender,
        recipient: body.recipient,
        document: body.document as { filename?: string; pages?: number } | undefined,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
      return withCors(request, Response.json(publicJob(job), { status: 201 }));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "jobs" && segments.length === 2 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const job = getJob(segments[1], auth.keyId);
    if (!job) return withCors(request, jsonError(404, "not_found", "Job not found"));
    return withCors(request, Response.json(publicJob(job)));
  }

  return withCors(request, jsonError(404, "not_found", `Unknown paper-send path /${segments.join("/")}`));
}
