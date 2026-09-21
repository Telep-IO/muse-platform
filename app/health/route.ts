import { withCors } from "@telep/platform";
import { healthPayload } from "@/lib/gateway";

export async function GET(request: Request) {
  return withCors(request, Response.json(healthPayload()));
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}
