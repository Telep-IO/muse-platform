import { withCors } from "@telep/platform";
import { platformOpenApi } from "@/lib/gateway";

export async function GET(request: Request) {
  return withCors(request, Response.json(platformOpenApi()));
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}
