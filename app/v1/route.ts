import { withCors } from "@telep/platform";
import { v1Index } from "@/lib/gateway";

export async function GET(request: Request) {
  return withCors(request, Response.json(v1Index()));
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}
