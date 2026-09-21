import { catalogOrigin, jsonError, withCors, type AuthResult } from "@telep/platform";
import { createJob, getJob, listJobs, publicJob } from "./jobs";

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
        fulfillment: "stub",
        note: "Create a job at POST /v1/paper-send/jobs. Mail provider fulfillment is not wired on this gateway yet.",
        endpoints: {
          jobs: "/v1/paper-send/jobs",
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

  if (segments[0] === "jobs" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    return withCors(request, Response.json({ jobs: listJobs(auth.keyId).map(publicJob) }));
  }

  if (segments[0] === "jobs" && segments.length === 1 && request.method === "POST") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const body = await readJson(request);
    try {
      const job = createJob({
        sender: body.sender,
        recipient: body.recipient,
        document: body.document as { filename?: string; pages?: number } | undefined,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
      });
      return withCors(request, Response.json(publicJob(job), { status: 201 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid job";
      return withCors(request, jsonError(400, "invalid_request", message));
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
